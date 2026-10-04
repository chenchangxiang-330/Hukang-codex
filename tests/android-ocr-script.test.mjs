import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

// Fake ADB checks shell control flow only. It never executes ML Kit or produces
// a real Android measurement; cloud evidence is required separately.
const root=fileURLToPath(new URL("../",import.meta.url));
function runFakeAdb(stale=false){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"hukang-adb-control-"));
  try{
    // Keep CLI entry paths real: Node canonicalizes a symlinked entry point,
    // whereas these modules intentionally detect direct execution by path.
    fs.cpSync(path.join(root,"scripts"),path.join(directory,"scripts"),{recursive:true});
    fs.symlinkSync(path.join(root,"tests"),path.join(directory,"tests"));
    const executable=path.join(directory,"adb");
    fs.writeFileSync(executable,`#!${process.execPath}
const fs=require('fs');const args=process.argv.slice(2),joined=args.join(' ');
if(joined.includes('am start')){const index=args.indexOf('ocrRunId');fs.writeFileSync('run-id',args[index+1]);console.log('Status: ok');}
else if(joined.startsWith('exec-out run-as')&&joined.includes(' cat ')){
 const data=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(root,"tests/fixtures/ocr/results/20261003-final-a49e85d.json"))},'utf8'));
 data.runId=${stale ? "'old-run'" : "fs.readFileSync('run-id','utf8')"};data.startedAt='2026-10-04T01:00:00Z';data.completedAt='2026-10-04T01:01:00Z';
 console.log(JSON.stringify(data));
}else if(joined.includes('logcat')||joined.includes('screencap')){console.error('MOCK_DIAGNOSTIC_FAILURE');process.exit(255);}
else if(joined.includes(' mv ')){fs.writeFileSync('archived-old-result','true');}
`);
    fs.chmodSync(executable,0o755);
    // macOS does not provide timeout; this fake forwards its argv without waiting.
    fs.writeFileSync(path.join(directory,"timeout"),'#!/bin/sh\nshift\nexec "$@"\n');
    fs.chmodSync(path.join(directory,"timeout"),0o755);
    const result=spawnSync("bash",[path.join(root,"scripts/run-android-ocr-regression.sh")],{cwd:directory,env:{...process.env,PATH:`${directory}:${process.env.PATH}`},encoding:"utf8",timeout:15000});
    return {...result,archived:fs.existsSync(path.join(directory,"archived-old-result")),hasJson:fs.existsSync(path.join(directory,"smoke-evidence/ocr-regression.json"))};
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
}
test("completed fresh OCR evidence survives optional log and screenshot failures",()=>{
  const result=runFakeAdb();assert.equal(result.status,0,result.stderr);assert.equal(result.archived,true);assert.equal(result.hasJson,true);
  assert.match(result.stdout,/Fresh OCR run identity/);assert.match(result.stdout,/quantitative guard passed/);
  assert.match(result.stderr,/logcat collection failed/);assert.match(result.stderr,/screenshot collection failed/);
});
test("old OCR identity fails even when optional diagnostics would fail",()=>{
  const result=runFakeAdb(true);assert.notEqual(result.status,0);assert.match(result.stderr,/identity mismatch/);
});
