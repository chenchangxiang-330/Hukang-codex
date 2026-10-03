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

const nutritionAnchor=/^[|1「(\[]*(?:能量|热量|蛋白质|脂肪|碳水化合物|钠|鈉)\s*$/;
const middleX=(line:OcrLine)=>(line.left+line.right)/2;
const middleY=(line:OcrLine)=>(line.top+line.bottom)/2;
const median=(values:number[])=>{const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.floor(ordered.length/2)]};
export function estimateNutritionSlope(lines:OcrLine[]):number{
  const slopes:number[]=[];
  for(const anchor of lines.filter(line=>nutritionAnchor.test(line.text))){
    const candidates=lines.filter(line=>line.left>anchor.right&&/^\s*\d/.test(line.text)&&!/%/.test(line.text)
      &&Math.abs(middleY(line)-middleY(anchor))<Math.min(line.bottom-line.top,anchor.bottom-anchor.top)*.85);
    candidates.sort((a,b)=>Math.abs(middleY(a)-middleY(anchor))-Math.abs(middleY(b)-middleY(anchor)));
    if(candidates[0])slopes.push((middleY(candidates[0])-middleY(anchor))/(middleX(candidates[0])-middleX(anchor)));
  }
  if(slopes.length<3)return 0;
  const slope=median(slopes),inliers=slopes.filter(value=>Math.abs(value-slope)<.035);
  return inliers.length>=3&&Math.abs(slope)<=.15&&Math.abs(slope)>=.015?median(inliers):0;
}

// Correct reading geometry, not the photo or its characters. At least three
// consistent label/value anchors are required; numeric strings remain unchanged.
export function textInNutritionRows(lines:OcrLine[]):string{
  const slope=estimateNutritionSlope(lines);
  return textInReadingRows(lines.map(line=>({...line,top:line.top-slope*middleX(line),bottom:line.bottom-slope*middleX(line)})));
}
