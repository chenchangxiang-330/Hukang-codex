import { File, Paths } from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import * as DB from "./database";
import { loadProfile, loadScannerPreferences, saveProfile, saveScannerPreferences } from "./preferences";
import { emptyProfile, type HealthProfile, type Product } from "./types";
import { assertStorageValue, validateStorageRegressionRequest, type StorageRegressionCheck, type StorageRegressionPhase } from "./storageRegressionAssertions";
import { nutritionSaveEvidence, productSaveEvidence } from "./recognitionSaveEvidence";

// This is deliberately separate from the user's UI and accepts no server URL,
// key, notification permission, OCR text supplied by a test annotation, or DB clear.
const launchToken = `storage-launch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const testDate = "2026-10-04";
const markerPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1kAAAAASUVORK5CYII=";
type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
type Manifest = {
  schemaVersion: 1; runId: string; status: "written"; writtenAt: string; launchToken: string;
  productId: number; inventoryId: number; logId: number; photoUri: string; photoBase64: string;
  snapshot: Snapshot; previousProfile: HealthProfile; previousPreferences: Awaited<ReturnType<typeof loadScannerPreferences>>;
  countsBefore: { products: number; inventory: number; nutritionLogs: number };
};

async function readSnapshot(productId: number, inventoryId: number, logId: number) {
  const product = await DB.getProduct(productId);
  const inventory = (await DB.getInventory()).find(item => item.id === inventoryId);
  const log = (await DB.getLogs(testDate)).find(item => item.id === logId);
  if (!product || !inventory || !log) throw new Error("STORAGE_RECORD_MISSING");
  return {
    product,
    inventory: { ...inventory, opened: Boolean(inventory.opened) },
    log,
    profile: await loadProfile(),
    preferences: await loadScannerPreferences(),
  };
}

function testProduct(runId: string, photoUri: string) {
  // Synthetic evidence tests selection/storage only. No Vision request is made,
  // and these values must never be counted as OCR or Vision accuracy evidence.
  const confirmation = nutritionSaveEvidence({
    primary: { text: `原始OCR ${runId}\n蛋白质 36g\n不可读小数留空` },
    original: { text: `未裁剪OCR ${runId}\n蛋白质 36g` },
    vision: { mock: true, status: "MOCK_STORAGE_ONLY_NO_REQUEST", raw_text: `MOCK Vision ${runId}\n能量309kJ`, basis: { amount: 125, unit: "mL" }, nutrition: { energy_kj: 309, protein_g: null, fat_g: null, carbohydrate_g: null, sodium_mg: 58 } },
    choice: "vision", localChoice: null,
  });
  const evidence = productSaveEvidence({ rawText: confirmation.rawText, source: "online_vision", recognitionEvidenceJson: confirmation.recognitionEvidenceJson }, null);
  return {
    barcode: null, rawBarcode: null, normalizedBarcode: null,
    name: `持久化回归 ${runId}`, brand: "云端测试", variant: "确认后编辑", category: "测试标记",
    netContent: 250, netContentUnit: "mL", basisAmount: 125, basisUnit: "mL",
    energyKcal: null, energyKj: 309, proteinG: null, fatG: null, carbohydrateG: null,
    saturatedFatG: 1.1, transFatG: 0, totalSugarG: null, addedSugarG: null, fiberG: 0, sodiumMg: 58,
    ingredients: "生牛乳", imageUri: photoUri, ingredientsRawText: "配料：生牛乳",
    ingredientsJson: '["生牛乳"]', ...evidence, lastVerifiedAt: "2026-10-04T00:00:00.000Z",
  };
}

async function writeManifest(file: File, value: Manifest) {
  const pending = new File(`${file.uri}.pending`);
  pending.write(JSON.stringify(value, null, 2));
  await pending.move(file);
}

export async function runStorageRegression(phase: StorageRegressionPhase, runId: string, status: (value: string) => void) {
  validateStorageRegressionRequest(phase, runId);
  const checks: StorageRegressionCheck[] = [];
  const check = (name: string, actual: unknown, expected: unknown) => checks.push(assertStorageValue(name, actual, expected));
  const manifestFile = new File(Paths.document, `storage-regression-${runId}.manifest.json`);
  status("正在初始化真实 SQLite 与本机偏好…");
  await DB.initializeDatabase();
  if (phase === "write") {
    if (manifestFile.exists) throw new Error("STORAGE_RUN_ALREADY_EXISTS:use_a_new_run_id");
    const previousProfile = await loadProfile(), previousPreferences = await loadScannerPreferences();
    // Test intents must never replace a real user's profile/preferences. The
    // CI emulator starts with defaults; a used device gets an explicit refusal.
    check("pristine_profile_required", previousProfile, emptyProfile);
    check("pristine_scanner_preferences_required", previousPreferences, {
      onlineEnhancement: false, onlineConsentAsked: false, developerMode: false,
    });
    const before = await DB.exportAll();
    const countsBefore = { products: before.products.length, inventory: before.inventory.length, nutritionLogs: before.nutritionLogs.length };
    const photo = new File(Paths.document, `storage-regression-${runId}.png`);
    if (photo.exists) throw new Error("STORAGE_PHOTO_ALREADY_EXISTS:use_a_new_run_id");
    photo.write(markerPng, { encoding: "base64" });
    check("photo_nonempty", photo.exists && photo.size > 0, true);
    status("正在使用生产保存接口写入商品、库存、摄入与偏好…");
    const productInput = testProduct(runId, photo.uri);
    const productId = await DB.saveProduct({ ...productInput, variant: "初次确认" });
    const beforeEdit = await DB.getProduct(productId);
    if (!beforeEdit) throw new Error("STORAGE_PRODUCT_MISSING_BEFORE_EDIT");
    // Use the same edit evidence helper as ProductForm, without a new scan route.
    const editEvidence = productSaveEvidence({}, beforeEdit);
    check("editing_preserves_saved_evidence", editEvidence, {
      ocrRawText: productInput.ocrRawText, dataSource: productInput.dataSource,
      recognitionEvidenceJson: productInput.recognitionEvidenceJson,
    });
    await DB.saveProduct({ ...productInput, ...editEvidence }, productId);
    const product = await DB.getProduct(productId);
    if (!product) throw new Error("STORAGE_PRODUCT_MISSING_AFTER_SAVE");
    for (const [key, expected] of Object.entries(productInput)) {
      check(`product_${key}`, product[key as keyof Product], expected);
    }
    check("vision_selection_keeps_local_raw_text", product.ocrRawText, `原始OCR ${runId}\n蛋白质 36g\n不可读小数留空`);
    const savedEvidence = JSON.parse(product.recognitionEvidenceJson ?? "null");
    check("independent_mock_vision_text", savedEvidence?.vision?.raw_text, `MOCK Vision ${runId}\n能量309kJ`);
    check("independent_original_ocr_text", savedEvidence?.local?.original?.text, `未裁剪OCR ${runId}\n蛋白质 36g`);
    check("explicit_vision_selection", savedEvidence?.selection?.basisSource, "vision");
    const inserted = await DB.addInventory(productId, null, "2026-10-03", photo.uri, 2.5, "冷藏");
    const inventoryId = inserted.lastInsertRowId;
    await DB.toggleOpened(inventoryId, true);
    await DB.addLog(product, 62.5, "mL", testDate, "12:30");
    const initialLog = (await DB.getLogs(testDate)).find(item => item.productId === productId);
    if (!initialLog) throw new Error("STORAGE_LOG_MISSING_AFTER_SAVE");
    check("initial_log_nondefault_basis_scaling", [initialLog.energyKj, initialLog.saturatedFatG, initialLog.transFatG, initialLog.sodiumMg], [154.5, .55, 0, 29]);
    check("initial_log_unknowns_remain_null", [initialLog.proteinG, initialLog.fatG, initialLog.carbohydrateG, initialLog.addedSugarG], [null, null, null, null]);
    await DB.updateLog(initialLog.id, 125, "mL", "13:45");
    const expectedProfile = { ...emptyProfile, completed: true, age: "35", heightCm: "165", weightKg: "60", goals: [`存储回归 ${runId}`], sound: false, notifications: false };
    const expectedPreferences = { onlineEnhancement: false, onlineConsentAsked: true, developerMode: true };
    await saveProfile(expectedProfile);
    await saveScannerPreferences(expectedPreferences);
    const snapshot = await readSnapshot(productId, inventoryId, initialLog.id);
    check("profile_written_exactly", snapshot.profile, expectedProfile);
    check("preferences_written_exactly", snapshot.preferences, expectedPreferences);
    check("inventory_product_relationship", snapshot.inventory.productId, productId);
    check("inventory_quantity", snapshot.inventory.quantity, 2.5);
    check("inventory_unknown_expiry", snapshot.inventory.expiryDate, null);
    check("inventory_production_date", snapshot.inventory.productionDate, "2026-10-03");
    check("inventory_photo_path", snapshot.inventory.photoUri, photo.uri);
    check("inventory_opened", snapshot.inventory.opened, true);
    check("inventory_opened_timestamp", typeof snapshot.inventory.openedAt === "string" && !Number.isNaN(Date.parse(snapshot.inventory.openedAt)), true);
    check("log_product_relationship", snapshot.log.productId, productId);
    check("log_amount_and_unit", [snapshot.log.amount, snapshot.log.amountUnit, snapshot.log.time], [125, "mL", "13:45"]);
    for (const key of ["energyKcal", "energyKj", "proteinG", "fatG", "carbohydrateG", "saturatedFatG", "transFatG", "totalSugarG", "addedSugarG", "fiberG", "sodiumMg"] as const) {
      check(`log_${key}`, snapshot.log[key], productInput[key]);
    }
    const after = await DB.exportAll();
    check("only_one_product_added", after.products.length, countsBefore.products + 1);
    check("only_one_inventory_added", after.inventory.length, countsBefore.inventory + 1);
    check("only_one_log_added", after.nutritionLogs.length, countsBefore.nutritionLogs + 1);
    const manifest: Manifest = { schemaVersion: 1, runId, status: "written", writtenAt: new Date().toISOString(), launchToken, productId, inventoryId, logId: initialLog.id, photoUri: photo.uri, photoBase64: await photo.base64(), snapshot, previousProfile, previousPreferences, countsBefore };
    await writeManifest(manifestFile, manifest);
    return { schemaVersion: 1, status: "completed", phase, runId, launchToken, checks, writtenAt: manifest.writtenAt, manifestUri: manifestFile.uri, snapshot, countsBefore, countsAfter: { products: after.products.length, inventory: after.inventory.length, nutritionLogs: after.nutritionLogs.length }, recognitionEvidence: "mock_selection_storage_only_no_vision_request", scope: "native_api_write_only_requires_external_force_stop_and_offline_verify" };
  }
  status("正在离线冷启动读取写入记录…");
  if (!manifestFile.exists) throw new Error("STORAGE_MANIFEST_MISSING");
  const manifest = JSON.parse(await manifestFile.text()) as Manifest;
  check("manifest_version", manifest.schemaVersion, 1);
  check("manifest_run_id", manifest.runId, runId);
  check("manifest_written", manifest.status, "written");
  check("new_js_process", manifest.launchToken !== launchToken, true);
  check("read_after_write", Date.parse(manifest.writtenAt) <= Date.now(), true);
  const network = await NetInfo.fetch();
  check("offline_network_state", network.isConnected, false);
  const snapshot = await readSnapshot(manifest.productId, manifest.inventoryId, manifest.logId);
  check("product_persisted_exactly", snapshot.product, manifest.snapshot.product);
  check("inventory_persisted_exactly", snapshot.inventory, manifest.snapshot.inventory);
  check("log_persisted_exactly", snapshot.log, manifest.snapshot.log);
  check("profile_persisted_exactly", snapshot.profile, manifest.snapshot.profile);
  check("scanner_preferences_persisted_exactly", snapshot.preferences, manifest.snapshot.preferences);
  const photo = new File(manifest.photoUri);
  check("photo_still_nonempty", photo.exists && photo.size > 0, true);
  check("photo_contents_persisted_exactly", await photo.base64(), manifest.photoBase64);
  const after = await DB.exportAll();
  check("product_count_unchanged", after.products.length, manifest.countsBefore.products + 1);
  check("inventory_count_unchanged", after.inventory.length, manifest.countsBefore.inventory + 1);
  check("log_count_unchanged", after.nutritionLogs.length, manifest.countsBefore.nutritionLogs + 1);
  // Restore only the original defaults that passed the pristine-state guard.
  // Retain the test DB records and photo as evidence; never clear the database.
  await saveProfile(manifest.previousProfile);
  await saveScannerPreferences(manifest.previousPreferences);
  check("original_profile_restored", await loadProfile(), manifest.previousProfile);
  check("original_preferences_restored", await loadScannerPreferences(), manifest.previousPreferences);
  return { schemaVersion: 1, status: "completed", phase, runId, launchToken, writeLaunchToken: manifest.launchToken, writtenAt: manifest.writtenAt, checks, snapshot, network: { isConnected: network.isConnected, isInternetReachable: network.isInternetReachable, type: network.type }, profileAndPreferencesRestored: true, recognitionEvidence: "mock_selection_storage_only_no_vision_request", scope: "native_api_offline_process_restart_durability_not_user_touch_confirmation" };
}
