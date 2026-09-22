import test from"node:test";
import assert from"node:assert/strict";
import{scoreProductCandidate}from"../src/productSearchLogic.ts";

test("candidate matching gives barcode the highest priority",()=>{const input={barcode:"6901234567890",brand:"农夫山泉",productName:"东方树叶",variant:"乌龙茶",quantity:"500mL",keywords:["0糖"]},exact={barcode:"6901234567890",brand:"农夫山泉",name:"东方树叶",variant:"乌龙茶",quantity:"500mL"},other={barcode:"6900000000000",brand:"农夫山泉",name:"东方树叶",variant:"青柑普洱",quantity:"900mL"};assert.ok(scoreProductCandidate(exact,input)>=200);assert.ok(scoreProductCandidate(exact,input)>scoreProductCandidate(other,input))});
test("UPC and zero-prefixed EAN are treated as the same barcode",()=>{const input={barcode:"012345678905"},candidate={barcode:"0012345678905",brand:"",name:"",variant:"",quantity:""};assert.equal(scoreProductCandidate(candidate,input),100)});
