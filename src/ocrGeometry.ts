export type OcrLine = {
  text: string;
  confidence: number | null;
  left: number; top: number; right: number; bottom: number;
};

// Preserve raw OCR separately. Geometry only restores rows, never characters.
export function textInReadingRows(lines: OcrLine[]): string {
  const rows: OcrLine[][] = [];
  for (const line of [...lines].sort((a,b) => a.top-b.top || a.left-b.left)) {
    const center = (line.top+line.bottom)/2;
    const row = rows.find(group => group.every(other =>
      Math.abs(center-(other.top+other.bottom)/2) < Math.min(line.bottom-line.top, other.bottom-other.top)*0.45));
    if (row) row.push(line); else rows.push([line]);
  }
  return rows.map(row => row.sort((a,b) => a.left-b.left).map(line => line.text).join(" ")).join("\n");
}
