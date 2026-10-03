export type ProductRequestError = "ONLINE_TIMEOUT" | "ONLINE_NETWORK_ERROR" | "ONLINE_HTTP_ERROR" | "ONLINE_INVALID_RESPONSE";
export type ProductRequestResult =
  | { ok: true; body: Record<string, any>; status: number; durationMs: number }
  | { ok: false; error: ProductRequestError; status?: number; durationMs: number };
type Diagnostic = (name: string, details?: unknown) => Promise<void> | void;

// The event payload deliberately excludes headers and credentials. Public product
// data is summarized rather than copying an unbounded server response into logs.
export async function requestProductJson(
  url: string,
  source: string,
  emit: Diagnostic = () => {},
  options: { timeoutMs?: number; allowNotFound?: boolean; fetcher?: typeof fetch } = {},
): Promise<ProductRequestResult> {
  const started = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  const event = async (name: string, details: unknown) => { try { await emit(name, details); } catch {} };
  try {
    await event("PRODUCT_NETWORK_REQUEST_START", { source, url, provider: "open_food_facts" });
    const response = await (options.fetcher ?? fetch)(url, {
      signal: controller.signal,
      headers: { "User-Agent": "HuKang/1.4 (Android; personal-test)" },
    });
    await event("HTTP_STATUS", { scope: "product_lookup", source, status: response.status });
    const text = await response.text();
    let body: any;
    try { body = JSON.parse(text); } catch {
      const error = response.ok ? "ONLINE_INVALID_RESPONSE" : "ONLINE_HTTP_ERROR";
      await event("PRODUCT_NETWORK_ERROR", { source, code: error, status: response.status, responseBytes: text.length, durationMs: Date.now() - started });
      return { ok: false, error, status: response.status, durationMs: Date.now() - started };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      await event("PRODUCT_NETWORK_ERROR", { source, code: "ONLINE_INVALID_RESPONSE", durationMs: Date.now() - started });
      return { ok: false, error: "ONLINE_INVALID_RESPONSE", status: response.status, durationMs: Date.now() - started };
    }
    // OFF documents an unknown barcode as HTTP 404 with status: 0. That is
    // a completed lookup with no record, not a transport/provider failure.
    const knownMissing = options.allowNotFound && response.status === 404 && body.status === 0;
    if (!response.ok && !knownMissing) {
      await event("PRODUCT_NETWORK_ERROR", { source, code: "ONLINE_HTTP_ERROR", status: response.status, durationMs: Date.now() - started });
      return { ok: false, error: "ONLINE_HTTP_ERROR", status: response.status, durationMs: Date.now() - started };
    }
    await event("PRODUCT_NETWORK_RESPONSE", {
      source, status: response.status, providerStatus: body.status ?? null,
      productPresent: !!body.product, productName: String(body.product?.product_name_zh ?? body.product?.product_name ?? "").slice(0, 160),
      productCount: Array.isArray(body.products) ? body.products.length : null,
      responseBytes: text.length, durationMs: Date.now() - started,
    });
    return { ok: true, body, status: response.status, durationMs: Date.now() - started };
  } catch (error) {
    const code = controller.signal.aborted || error instanceof Error && error.name === "AbortError" ? "ONLINE_TIMEOUT" : "ONLINE_NETWORK_ERROR";
    await event("PRODUCT_NETWORK_ERROR", { source, code, durationMs: Date.now() - started });
    return { ok: false, error: code, durationMs: Date.now() - started };
  } finally { clearTimeout(timer); }
}
