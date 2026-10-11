import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkOcrRegression} from './check-ocr-regression.mjs';

export function checkPaddleSwitchGate(result,score) {
  const s=checkOcrRegression(result,score,'paddle');
  if(s.correct!==10||s.wrong!==0||s.missing!==0||s.evaluatedFields!==10) throw new Error(`PADDLE_DEFAULT_GATE_NOT_MET: ${JSON.stringify(s)}`);
  const milk=result.runs.find(run=>run.fixtureId==='6923644266066');
  // This is a post-inference QA assertion, never input to OCR or parsing.
  const outputs=['original','preprocessed'].map(name=>milk?.stages[name]?.rawText?.normalize('NFKC')??'');
  for(const decimal of ['3.6','4.4','5.0']) {
    const pattern=new RegExp(`(?<![0-9])${decimal.replace('.', '\\.')}([^0-9]|$)`);
    if(!outputs.some(text=>pattern.test(text))) throw new Error(`MILK_DECIMAL_NOT_IN_NATIVE_RAW_OUTPUT: ${decimal}`);
  }
  return {status:'passed',correct:s.correct,wrong:s.wrong,missing:s.missing,scope:'two_public_photos_10_fields_only',nativeMilkDecimals:['3.6','4.4','5.0']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [raw,scored]=process.argv.slice(2);
  console.log(JSON.stringify(checkPaddleSwitchGate(JSON.parse(readFileSync(raw,'utf8')),JSON.parse(readFileSync(scored,'utf8'))),null,2));
}
