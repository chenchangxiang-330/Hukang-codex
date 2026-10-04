import test from "node:test";
import assert from "node:assert/strict";
import { nutritionSaveEvidence, productSaveEvidence } from "../src/recognitionSaveEvidence.ts";

test("choosing Vision keeps exact OCR text and separate remote evidence", () => {
  const primary = {text:"蛋白质 36g\n449\n509"}, original = {text:"项目\n蛋白质\n36g"};
  const vision = {raw_text:"蛋白质 3.6g",nutrition:{protein_g:3.6}};
  const saved = nutritionSaveEvidence({primary,original,vision,choice:"vision",localChoice:null});
  assert.equal(saved.rawText, primary.text);
  assert.deepEqual(JSON.parse(saved.recognitionEvidenceJson), {schemaVersion:1,local:{primary,original},vision,selection:{basisSource:"vision",localSource:null}});
  assert.equal(nutritionSaveEvidence({primary,original,vision,choice:"local",localChoice:"original"}).rawText,original.text);
});
test("editing a saved product preserves OCR, source and independent evidence", () => {
  const existing = {ocrRawText:"原始 36g",dataSource:"mixed",recognitionEvidenceJson:'{"vision":{"protein_g":3.6}}'};
  assert.deepEqual(productSaveEvidence({},existing),existing);
  assert.deepEqual(productSaveEvidence({rawText:"新原文",source:"local_ocr"},existing),{...existing,ocrRawText:"新原文",dataSource:"local_ocr"});
  assert.equal(productSaveEvidence({rawText:""},existing).ocrRawText,null);
  assert.deepEqual(productSaveEvidence({},null),{ocrRawText:null,dataSource:"manual",recognitionEvidenceJson:null});
});
