import test from "node:test";
import assert from "node:assert/strict";
import { requestProductJson } from "../src/productRequest.ts";
import { buildPublicProductQuery, classifyLookupBody, normalizeOnlineProduct, summarizeSearchNetwork, productLookupMessage } from "../src/productOnlineLogic.ts";

const url = "https://world.openfoodfacts.org/api/v2/product/6930487920475.json";
const response = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const eventsFor = () => { const events = []; return { events, emit: (name, details) => { events.push({ name, details }); } }; };

test("OFF 404/status 0 is a completed not-found lookup, not an API error", async () => {
  const { events, emit } = eventsFor();
  const result = await requestProductJson(url, "barcode", emit, { allowNotFound: true, fetcher: async () => response(404, { status: 0, status_verbose: "product not found" }) });
  assert.equal(result.ok, true); assert.equal(classifyLookupBody(result.body), "not_found");
  assert.ok(events.some(e => e.name === "PRODUCT_NETWORK_REQUEST_START"));
  assert.ok(events.some(e => e.name === "PRODUCT_NETWORK_RESPONSE" && e.details.status === 404));
  assert.ok(!events.some(e => e.name === "PRODUCT_NETWORK_ERROR"));
});

test("a record without a name is incomplete data, not an unknown barcode", async () => {
  const result = await requestProductJson(url, "barcode", undefined, { fetcher: async () => response(200, { status: 1, product: { code: "6937003117814", nutrition_data_per: "100g" } }) });
  assert.equal(result.ok, true); assert.equal(classifyLookupBody(result.body), "found");
  const product = normalizeOnlineProduct(result.body.product);
  assert.equal(product.name, ""); assert.ok(product.warnings.includes("ONLINE_NAME_MISSING")); assert.equal(product.needsConfirmation, true);
});

test("HTTP service failure is not confused with an empty product result", async () => {
  const result = await requestProductJson(url, "text", undefined, { fetcher: async () => response(503, "<html>unavailable</html>") });
  assert.equal(result.ok, false); assert.equal(result.error, "ONLINE_HTTP_ERROR"); assert.equal(result.status, 503);
});

test("HTML with HTTP 200 is an invalid response rather than a successful empty query", async () => {
  const result = await requestProductJson(url, "text", undefined, { fetcher: async () => response(200, "<html>blocked</html>") });
  assert.equal(result.ok, false); assert.equal(result.error, "ONLINE_INVALID_RESPONSE");
});

test("404 without the documented missing-record JSON remains a provider failure", async () => {
  const result = await requestProductJson(url, "barcode", undefined, { allowNotFound: true, fetcher: async () => response(404, { message: "wrong route" }) });
  assert.equal(result.ok, false); assert.equal(result.error, "ONLINE_HTTP_ERROR");
});

test("timeout and transport failure have separate diagnostic outcomes", async () => {
  const timeout = await requestProductJson(url, "barcode", undefined, { timeoutMs: 5, fetcher: async (_, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) });
  assert.equal(timeout.ok, false); assert.equal(timeout.error, "ONLINE_TIMEOUT");
  const network = await requestProductJson(url, "barcode", undefined, { fetcher: async () => { throw new TypeError("Network request failed"); } });
  assert.equal(network.ok, false); assert.equal(network.error, "ONLINE_NETWORK_ERROR");
});

test("diagnostic storage errors do not prevent the actual public request", async () => {
  let requested = false;
  const result = await requestProductJson(url, "barcode", () => { throw new Error("storage unavailable"); }, { fetcher: async () => { requested = true; return response(200, { status: 0 }); } });
  assert.equal(requested, true); assert.equal(result.ok, true);
});

test("public request evidence contains status/count/duration but no credentials or headers", async () => {
  const { events, emit } = eventsFor();
  await requestProductJson(url, "text", emit, { fetcher: async () => response(200, { products: [], token: "not-a-log-field" }) });
  const payload = JSON.stringify(events);
  assert.ok(!payload.includes("not-a-log-field")); assert.ok(!payload.includes("Authorization"));
  const event = events.find(e => e.name === "PRODUCT_NETWORK_RESPONSE");
  assert.equal(event.details.productCount, 0); assert.ok(event.details.durationMs >= 0);
});

test("all failed search providers cannot be reported as online success", () => {
  assert.equal(summarizeSearchNetwork(0, ["http_error", "timeout"]), "http_error");
  assert.equal(summarizeSearchNetwork(0, ["timeout", "timeout"]), "timeout");
  assert.equal(summarizeSearchNetwork(0, ["offline"]), "offline");
  assert.equal(summarizeSearchNetwork(0, []), "not_requested");
  assert.equal(summarizeSearchNetwork(1, ["http_error"]), "online");
});

test("missing nutrition basis does not guess 100g from package size or nutrient suffixes", () => {
  const p = normalizeOnlineProduct({ product_name_zh: "牛奶", quantity: "250mL", nutriments: { proteins_100g: 3.6, sugars_100g: 5, "energy-kj_100g": 309 } });
  assert.equal(p.basisAmount, 0); assert.equal(p.basisUnit, ""); assert.equal(p.nutritionBasisKnown, false);
  assert.equal(p.nutrients.proteinG, null); assert.equal(p.nutrients.totalSugarG, null); assert.ok(p.warnings.includes("ONLINE_BASIS_MISSING"));
});

test("per-serving public values never reuse per-100g fields", () => {
  const p = normalizeOnlineProduct({ nutrition_data_per: "serving", nutriments: { proteins_serving: 2, proteins_100g: 20, carbohydrates_serving: 5, carbohydrates_100g: 50, sodium_serving: 0.02, sugars_serving: 4 } });
  assert.equal(p.basisAmount, 1); assert.equal(p.basisUnit, "份"); assert.equal(p.nutrients.proteinG, 2); assert.equal(p.nutrients.sodiumMg, 20); assert.equal(p.nutrients.totalSugarG, 4); assert.equal(p.nutrients.addedSugarG, null);
});

test("impossible public nutrition values become unknown rather than trusted facts", () => {
  const p = normalizeOnlineProduct({ nutrition_data_per: "100g", nutriments: { proteins_100g: 21, fat_100g: 37.7, carbohydrates_100g: 112, "saturated-fat_100g": 112, sugars_100g: -4, sodium_100g: 1.248 } });
  assert.equal(p.nutrients.carbohydrateG, null); assert.equal(p.nutrients.saturatedFatG, null); assert.equal(p.nutrients.totalSugarG, null); assert.equal(p.nutrients.sodiumMg, 1248);
  assert.ok(p.warnings.includes("ONLINE_VALUE_OUT_OF_RANGE:carbohydrateG"));
});

test("contradictory subfields and macronutrient sums require confirmation", () => {
  const p = normalizeOnlineProduct({ nutrition_data_per: "100g", nutriments: { proteins_100g: 60, fat_100g: 30, carbohydrates_100g: 40, "saturated-fat_100g": 31, sugars_100g: 50 } });
  assert.equal(p.nutrients.proteinG, null); assert.equal(p.nutrients.fatG, null); assert.equal(p.nutrients.carbohydrateG, null);
  assert.equal(p.nutrients.saturatedFatG, null); assert.equal(p.nutrients.totalSugarG, null); assert.ok(p.warnings.includes("ONLINE_MACRONUTRIENTS_CONFLICT"));
});

test("lookup failure explanations distinguish query absent, delayed, rejected, malformed and empty", () => {
  const reasons = ["not_found", "offline", "timeout", "http_error", "invalid_response", "network_error"];
  assert.equal(new Set(reasons.map(productLookupMessage)).size, reasons.length);
});

test("public text search uses concise identity terms rather than requiring duplicate OCR/quantity tokens", () => {
  assert.equal(buildPublicProductQuery({ brand: "特仑苏", productName: "纯牛奶", quantity: "250mL", variant: "经典", keywords: ["特仑苏", "纯牛奶", "蛋白质3.6g"] }), "特仑苏 纯牛奶");
  assert.equal(buildPublicProductQuery({ brand: "特仑苏", productName: "特仑苏" }), "特仑苏");
  assert.equal(buildPublicProductQuery({ keywords: ["商品", "品牌", "营养", "一大段 OCR"] }), "商品 品牌");
});
