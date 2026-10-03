import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeProductClues, resolveProductClues } from "../src/productClueEvidence.ts";

const local={brand:"品牌甲",productName:"食品甲",variant:"原味",quantity:"250mL",category:"牛奶",keywords:["品牌甲 食品甲","原味 250mL","包装正面"],barcode:"6923644266066"};

test("product clue conflict keeps both candidates and does not automatically choose Vision",()=>{
 const result=mergeProductClues(local,{brand:"品牌乙",product_name:"食品乙",variant:"原味",quantity:"500mL",category:"饮料",barcode:"0000000000000",visible_text:["品牌乙 食品乙","500mL","包装正面"]});
 assert.equal(result.clues.brand,"");assert.equal(result.clues.productName,"");assert.equal(result.clues.quantity,"");assert.equal(result.clues.category,"");
 assert.equal(result.clues.variant,"原味");assert.equal(result.clues.barcode,local.barcode);assert.equal(result.conflicts.length,4);
 assert.deepEqual(result.conflicts[0],{field:"brand",label:"品牌",local:"品牌甲",vision:"品牌乙"});
 assert.deepEqual(result.clues.keywords,["包装正面"]);
 assert.equal(resolveProductClues(result.clues,result.conflicts,{}).ready,false);
});

test("only missing product clues are supplemented without overwriting local evidence",()=>{
 const original={...local,brand:"",productName:"",quantity:"250 mL"};
 const result=mergeProductClues(original,{brand:"品牌乙",product_name:"食品乙",quantity:"250mL",variant:"原味"});
 assert.equal(result.clues.brand,"品牌乙");assert.equal(result.clues.productName,"食品乙");assert.equal(result.clues.quantity,"250 mL");assert.equal(result.conflicts.length,0);
 assert.equal(original.brand,"");assert.equal(local.barcode,result.clues.barcode);
});

test("every conflicting field requires local, remote or explicit blank confirmation",()=>{
 const result=mergeProductClues(local,{brand:"品牌乙",product_name:"食品乙",quantity:"500mL"});
 const pending=resolveProductClues(result.clues,result.conflicts,{brand:"local"});
 assert.equal(pending.ready,false);assert.equal(pending.clues.brand,"品牌甲");assert.equal(pending.clues.productName,"");assert.equal(pending.clues.quantity,"");
 const chosen=resolveProductClues(result.clues,result.conflicts,{brand:"local",productName:"vision",quantity:"blank"});
 assert.equal(chosen.ready,true);assert.equal(chosen.clues.brand,"品牌甲");assert.equal(chosen.clues.productName,"食品乙");assert.equal(chosen.clues.quantity,"");assert.equal(chosen.clues.barcode,local.barcode);
 assert.equal(result.clues.brand,"");assert.equal(result.conflicts[0].vision,"品牌乙");
});

test("product screen pauses queries and manual draft creation until explicit conflict decisions",()=>{
 const source=readFileSync(new URL("../src/ProductRecognitionScreen.tsx",import.meta.url),"utf8");
 assert.match(source,/PRODUCT_SEARCH_NOT_SENT/);assert.match(source,/CLUE_CONFLICT_NEEDS_CONFIRMATION/);
 assert.match(source,/if\(!decision.ready\|\|working\)return/);
 assert.match(source,/disabled=\{!decision.ready\}/);
 assert.match(source,/onManual\(makeDraft\(decision.clues\)\)/);
});
