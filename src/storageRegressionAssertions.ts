// Shared by the native regression and its Node checks. These assertions do not
// open SQLite or claim anything about the Expo bridge or Android durability.
export type StorageRegressionPhase = "write" | "verify";
export type StorageRegressionCheck = { name: string; passed: true };

export function validateStorageRegressionRequest(phase: unknown, runId: unknown): asserts phase is StorageRegressionPhase {
  if (phase !== "write" && phase !== "verify") throw new Error("STORAGE_PHASE_INVALID");
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{5,79}$/.test(runId)) {
    throw new Error("STORAGE_RUN_ID_INVALID");
  }
}

export function assertStorageValue(name: string, actual: unknown, expected: unknown): StorageRegressionCheck {
  // Object keys may be returned in a different order by SQLite/AsyncStorage.
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") {
      const object = value as Record<string, unknown>;
      return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "undefined";
  };
  if (canonical(actual) !== canonical(expected)) throw new Error(`STORAGE_ASSERTION_FAILED:${name}`);
  return { name, passed: true };
}
