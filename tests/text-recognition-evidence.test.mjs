import test from "node:test";
import assert from "node:assert/strict";
import {visionTextCandidate,sameTextEvidence,visionSkipMessage} from "../src/textRecognitionEvidence.ts";
test("Vision candidate retains labelled raw dates rather than unlabelled arrays",()=>{
  assert.equal(visionTextCandidate({raw_text:"生产日期2026/10/01",dates:["2026/10/01"]},"date"),"生产日期2026/10/01");
  assert.equal(visionTextCandidate({raw_text:"",dates:["2026/10/01"]},"date"),"2026/10/01");
  assert.equal(visionTextCandidate({raw_text:"",date_label:{production_date:"2026/10/01",expiry_date:null,shelf_life:"30天",batch:"A1"}},"date"),"生产日期：2026/10/01\n保质期：30天\n批次：A1");
});
test("ingredient evidence preserves nested order and compares without modifying raw",()=>{
  const raw="配料：水、调味料（盐、糖）、牛乳10%";
  assert.equal(visionTextCandidate({raw_text:raw},"ingredients"),raw);
  assert.ok(sameTextEvidence("配料：水、糖","配料: 水、糖"));
  assert.ok(!sameTextEvidence("配料：水、糖","配料：糖、水"));
});
test("not configured, not sent, timeout and invalid response have distinct visible explanations",()=>{
  assert.match(visionSkipMessage("VISION_NOT_CONFIGURED"),/没有发送/);
  assert.match(visionSkipMessage("VISION_TIMEOUT"),/超时/);
  assert.match(visionSkipMessage("VISION_INVALID_RESPONSE:wrong_task"),/无法使用/);
});
