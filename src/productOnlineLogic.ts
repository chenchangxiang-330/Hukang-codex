import type { Nutrients } from "./types";

export type OnlineProduct = {
  name: string; brand: string; netContent: string; ingredients: string; imageUri: string;
  basisAmount: number; basisUnit: string; nutrients: Nutrients;
  warnings: string[]; needsConfirmation: true; nutritionBasisKnown: boolean;
};
export const emptyOnlineNutrients = (): Nutrients => ({ energyKj: null, energyKcal: null, proteinG: null, fatG: null, saturatedFatG: null, transFatG: null, carbohydrateG: null, totalSugarG: null, addedSugarG: null, fiberG: null, sodiumMg: null });
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

export function normalizeOnlineProduct(raw: Record<string, any>): OnlineProduct {
  const warnings: string[] = [], n = raw.nutriments ?? {}, per = text(raw.nutrition_data_per).toLowerCase();
  const basis = /^100\s*(?:g|克)$/.test(per) ? { amount: 100, unit: "g", suffix: "_100g" }
    : /^100\s*(?:ml|毫升)$/.test(per) ? { amount: 100, unit: "mL", suffix: "_100g" }
    : per === "serving" ? { amount: 1, unit: "份", suffix: "_serving" } : null;
  const nutrients = emptyOnlineNutrients();
  if (!basis) warnings.push("ONLINE_BASIS_MISSING");
  else {
    const mapping: [keyof Nutrients, string][] = [["energyKj", "energy-kj"], ["energyKcal", "energy-kcal"], ["proteinG", "proteins"], ["fatG", "fat"], ["saturatedFatG", "saturated-fat"], ["transFatG", "trans-fat"], ["carbohydrateG", "carbohydrates"], ["totalSugarG", "sugars"], ["fiberG", "fiber"]];
    for (const [field, key] of mapping) {
      const rawValue = n[`${key}${basis.suffix}`], value = number(rawValue);
      if (rawValue != null && value == null) warnings.push(`ONLINE_VALUE_INVALID:${field}`);
      const upper = basis.amount === 100 ? field === "energyKj" ? 4500 : field === "energyKcal" ? 1100 : 100 : null;
      if (value != null && upper != null && value > upper) warnings.push(`ONLINE_VALUE_OUT_OF_RANGE:${field}`);
      else nutrients[field] = value;
    }
    const sodium = number(n[`sodium${basis.suffix}`]);
    if (sodium != null && (basis.amount !== 100 || sodium <= 100)) nutrients.sodiumMg = sodium * 1000;
    else if (n[`sodium${basis.suffix}`] != null) warnings.push("ONLINE_VALUE_INVALID:sodiumMg");
    for (const field of ["saturatedFatG", "transFatG"] as const) if (nutrients[field] != null && nutrients.fatG != null && nutrients[field]! > nutrients.fatG) { nutrients[field] = null; warnings.push(`ONLINE_VALUE_CONFLICT:${field}`); }
    if (nutrients.totalSugarG != null && nutrients.carbohydrateG != null && nutrients.totalSugarG > nutrients.carbohydrateG) { nutrients.totalSugarG = null; warnings.push("ONLINE_VALUE_CONFLICT:totalSugarG"); }
    // Impossible public-database records must not silently become food facts.
    if (basis.amount === 100 && [nutrients.proteinG, nutrients.fatG, nutrients.carbohydrateG].every(v => v != null) && nutrients.proteinG! + nutrients.fatG! + nutrients.carbohydrateG! > 105) {
      nutrients.proteinG = nutrients.fatG = nutrients.carbohydrateG = null; warnings.push("ONLINE_MACRONUTRIENTS_CONFLICT");
    }
  }
  if (!text(raw.product_name_zh) && !text(raw.product_name)) warnings.push("ONLINE_NAME_MISSING");
  return { name: text(raw.product_name_zh) || text(raw.product_name), brand: text(raw.brands), netContent: text(raw.quantity), ingredients: text(raw.ingredients_text_zh) || text(raw.ingredients_text), imageUri: text(raw.image_front_url), basisAmount: basis?.amount ?? 0, basisUnit: basis?.unit ?? "", nutrients, warnings, needsConfirmation: true, nutritionBasisKnown: !!basis };
}

export function classifyLookupBody(body: Record<string, any>): "found" | "not_found" | "invalid" {
  if (body.status === 0) return "not_found";
  return body.status === 1 && body.product && typeof body.product === "object" && !Array.isArray(body.product) ? "found" : "invalid";
}

export type SearchFailure = "offline" | "timeout" | "http_error" | "network_error" | "invalid_response";
export function summarizeSearchNetwork(completedRequests: number, failures: SearchFailure[]): "online" | SearchFailure | "not_requested" {
  if (completedRequests > 0) return "online";
  if (!failures.length) return "not_requested";
  if (failures.every(x => x === "timeout")) return "timeout";
  if (failures.every(x => x === "offline")) return "offline";
  if (failures.includes("http_error")) return "http_error";
  if (failures.includes("invalid_response")) return "invalid_response";
  return "network_error";
}

export function productLookupMessage(reason: "not_found" | SearchFailure): string {
  return reason === "not_found" ? "已联网查询公开商品库，但暂无该条码记录。"
    : reason === "offline" ? "当前离线，商品查询没有发出。"
    : reason === "timeout" ? "商品查询超时，尚不能确定商品库是否有记录。"
    : reason === "http_error" ? "商品服务暂时不可用，查询没有完成。"
    : reason === "invalid_response" ? "商品服务返回的数据无法读取，查询没有完成。"
    : "网络请求失败，尚不能确定商品库是否有记录。";
}

export function buildPublicProductQuery(input: { brand?: string | null; productName?: string | null; keywords?: string[] }): string {
  const identity = [input.brand, input.productName].map(v => text(v).replace(/\s+/g, " ")).filter(Boolean);
  const terms = identity.length ? identity : (input.keywords ?? []).slice(0, 2).map(v => text(v).replace(/\s+/g, " ")).filter(Boolean);
  // Quantity/variant remain ranking evidence, not mandatory indexed words. OCR
  // often repeats a title in keywords; duplicating all of it makes search brittle.
  return [...new Set(terms)].join(" ").slice(0, 160);
}
