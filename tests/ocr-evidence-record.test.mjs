import test from "node:test";
import assert from "node:assert/strict";
import { maxArchivedOcrImageBytes, ocrEvidenceArchiveRecord } from "../src/ocrEvidenceRecord.ts";

const source={uri:"file:///cache/input.jpg",sha256:"a".repeat(64),bytes:1234},retained={...source,uri:"file:///files/ocr-evidence/run/input-image.bin"};
const raw={engine:"paddle",text:"蛋白质36g",lines:[{text:"蛋白质36g",left:10,top:20,right:100,bottom:40,polygon:[{x:10,y:20},{x:100,y:20},{x:100,y:40},{x:10,y:40}]}],imageUri:source.uri,imageSha256:source.sha256,inputImage:{width:500,height:800,coordinateSpace:"decoded_image_pixels"},models:[{file:"mock-model.onnx",sha256:"b".repeat(64),bytes:100}],versions:{onnxRuntime:"mock-runtime",paddleSourceCommit:"mock-source"},nativeDurationMs:321,timings:{recognitionMs:210},memory:{observedPeakPssKb:12345}};
const context={evidenceId:"mock-archive",createdAt:"2026-10-12T00:00:00Z",source,retained};

test("local archive keeps exact native OCR/geometry/identity and parser input without fabricating chosen values",()=>{
  const before=structuredClone(raw),record=ocrEvidenceArchiveRecord({imageUri:source.uri,task:"nutrition",raw,parserInput:"蛋白质 36g",expectedImageSha256:source.sha256},context);
  assert.equal(record.status,"completed");assert.deepEqual(record.raw,before);assert.equal(record.parserInput,"蛋白质 36g");
  assert.deepEqual(record.retainedInput,retained);assert.deepEqual(record.sourceInput,source);assert.equal(Object.hasOwn(record,"confirmed"),false);
  assert.equal(Object.hasOwn(record,"nutrition"),false);assert.deepEqual(raw,before);
});

test("archive rejects image byte/hash mismatch and inputs larger than the bounded retention size",()=>{
  const input={imageUri:source.uri,task:"general",raw,parserInput:raw.text,expectedImageSha256:source.sha256};
  for(const changed of [{...retained,sha256:"c".repeat(64)},{...retained,bytes:1235},{...retained,bytes:0},{...retained,bytes:maxArchivedOcrImageBytes+1}]) {
    assert.throws(()=>ocrEvidenceArchiveRecord(input,{...context,retained:changed}),/OCR_ARCHIVE_IMAGE/);
  }
  assert.throws(()=>ocrEvidenceArchiveRecord({...input,expectedImageSha256:"d".repeat(64)},context),/OCR_ARCHIVE_IMAGE_CONTENT_MISMATCH/);
});

test("legacy metadata gaps remain explicit without inventing model identity or time",()=>{
  const record=ocrEvidenceArchiveRecord({imageUri:source.uri,task:"general",raw:{text:"旧桥原文",lines:[]},parserInput:"旧桥原文"},context);
  assert.equal(record.status,"partial");assert.ok(record.missingMetadata.includes("models"));assert.ok(record.missingMetadata.includes("versions"));
  assert.equal(Object.hasOwn(record.raw,"models"),false);assert.equal(record.raw.text,"旧桥原文");
});
