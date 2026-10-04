type OcrEvidence = { text: string } | null | undefined;

// Field selection changes the chosen values, never the source's unmodified text.
export function nutritionSaveEvidence(input: {
  primary: OcrEvidence; original: OcrEvidence; vision: unknown;
  choice: "local" | "vision" | null; localChoice: "primary" | "original" | null;
}) {
  const chosen = input.localChoice === "original" ? input.original : input.primary;
  return {
    rawText: chosen?.text ?? input.original?.text ?? "",
    recognitionEvidenceJson: JSON.stringify({
      schemaVersion: 1, local: { primary: input.primary ?? null, original: input.original ?? null },
      vision: input.vision ?? null, selection: { basisSource: input.choice, localSource: input.localChoice },
    }),
  };
}

type Source = "manual" | "local_ocr" | "open_food_facts" | "online_vision" | "mixed";
type Evidence = { ocrRawText: string | null; dataSource: Source; recognitionEvidenceJson?: string | null };
export function productSaveEvidence(route: { rawText?: string; source?: Source; recognitionEvidenceJson?: string }, existing: Evidence | null) {
  return {
    ocrRawText: route.rawText !== undefined ? route.rawText || null : existing?.ocrRawText ?? null,
    dataSource: route.source ?? existing?.dataSource ?? "manual",
    recognitionEvidenceJson: route.recognitionEvidenceJson ?? existing?.recognitionEvidenceJson ?? null,
  };
}
