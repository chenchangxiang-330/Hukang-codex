import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export function checkOcrRegression(result, score, engine='mlkit') {
  if (engine !== 'mlkit' && engine !== 'paddle') throw new Error('Invalid engine');
  if (result.runs?.length!==2) throw new Error('Expected both real nutrition images');
  for (const run of result.runs) {
    if (run.evidence!==`device_${engine}_image_execution` || run.platform!=='android') throw new Error('OCR evidence not from Android engine');
    for (const name of ['original','preprocessed','production']) {
      const stage=run.stages?.[name];
      if (stage?.status!=='ok' || !stage.rawText) throw new Error(`${run.fixtureId}/${name}: no real text`);
      if(engine==='paddle' && name!=='production') {
        const ocr=stage.ocr;
        if(ocr?.engine!=='paddle'||!ocr.lines?.length||!ocr.imageSha256||!ocr.models?.length)
          throw new Error(`${run.fixtureId}/${name}: missing Paddle identity/geometry`);
      }
    }
    if(run.stages.vision.status!=='not_run'||run.stages.vision.reason!=='CI_NO_VISION_KEY') throw new Error('Vision must not execute');
  }
  const s=score.summaries.merged;
  // Both engines must at least retain the exact two-photo production baseline.
  // The stricter default-switch gate is separate, after evidence is collected.
  if(s.correct<7||s.wrong!==0||s.unsupportedVisibleClaims!==0||s.wrongBasisImages!==0||s.missingBasisImages!==0)
    throw new Error(`Real nutrition regression worsened: ${JSON.stringify(s)}`);
  return s;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [raw,scored,engine]=process.argv.slice(2);
  const s=checkOcrRegression(JSON.parse(readFileSync(raw,'utf8')),JSON.parse(readFileSync(scored,'utf8')),engine);
  console.log(`Both real images executed with ${engine}; quantitative guard passed: ${s.correct}/${s.wrong}/${s.missing}.`);
}
