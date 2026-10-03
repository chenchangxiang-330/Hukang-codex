import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { requestVision } from "../src/visionRequest.ts";
import { validateVisionResult,visionConfigIssue } from "../src/visionProtocol.ts";
const config={endpoint:"https://example.invalid/v1/chat/completions",model:"test-model",apiKey:"test-key-not-real"};
const result={detected_type:"nutrition_label",raw_text:"每100mL 能量309kJ 蛋白质3.6g 脂肪4.4g 碳水化合物5g 钠58mg",basis:{amount:100,unit:"mL"},nutrition:{energy_kj:309,protein_g:3.6,fat_g:4.4,carbohydrate_g:5,sodium_mg:58},uncertain_fields:[]};
const image=readFileSync(new URL("./fixtures/ocr/nutrition/6923644266066.jpg",import.meta.url)).toString("base64");
const harness=()=>{const events=[];return{events,event:async(name,details)=>{events.push({name,details})}}};

test("mock transport sends actual fixture JPEG bytes, high detail and food-specific prompt",async()=>{
  const {events,event}=harness();let called=0;
  const received=await requestVision(config,"nutrition_label",async()=>image,event,async(url,options)=>{
    called++;assert.equal(url,config.endpoint);const body=JSON.parse(options.body);
    assert.equal(body.messages[1].content[1].image_url.url,`data:image/jpeg;base64,${image}`);
    assert.equal(body.messages[1].content[1].image_url.detail,"high");
    assert.match(body.messages[1].content[0].text,/中国食品包装营养成分表/);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}),{status:200});
  });
  assert.equal(called,1);assert.equal(received.nutrition.protein_g,3.6);
  for(const name of ["VISION_REQUEST_START","VISION_RESPONSE_RAW","VISION_STRUCTURED_RESULT","VISION_DURATION_MS"])assert.ok(events.some(e=>e.name===name),name);
  assert.ok(!JSON.stringify(events).includes(config.apiKey));
  assert.ok(!JSON.stringify(events).includes(image));
});

test("unconfigured is distinct from sent request failure and never reads or uploads image",async()=>{
  const {events,event}=harness();let called=false;
  await assert.rejects(requestVision({...config,apiKey:""},"nutrition_label",async()=>{called=true;return image},event,async()=>{called=true}),/VISION_NOT_CONFIGURED/);
  assert.equal(called,false);assert.ok(events.some(e=>e.name==="VISION_NOT_SENT"));
  assert.ok(!events.some(e=>e.name==="VISION_REQUEST_START"));
});

test("unreadable image is not sent; unauthorized, network failure and invalid response are distinct",async()=>{
  const cases=[
    {read:async()=>{throw new Error("disk")},fetch:async()=>{assert.fail("must not send")},code:"VISION_IMAGE_UNREADABLE",sent:false},
    {read:async()=>image,fetch:async()=>new Response("",{status:401}),code:"VISION_AUTH_ERROR",sent:true},
    {read:async()=>image,fetch:async()=>{throw new Error("Network request failed")},code:"VISION_NETWORK_ERROR",sent:true},
    {read:async()=>image,fetch:async()=>{throw new DOMException("Timed out","AbortError")},code:"VISION_TIMEOUT",sent:true},
    {read:async()=>image,fetch:async()=>new Response("{}"),code:"VISION_INVALID_RESPONSE",sent:true},
    {read:async()=>image,fetch:async()=>new Response(JSON.stringify({choices:[{message:{content:"not json"}}]})),code:"VISION_INVALID_RESPONSE",sent:true},
  ];
  for(const c of cases){const {events,event}=harness();await assert.rejects(requestVision(config,"nutrition_label",c.read,event,c.fetch),new RegExp(c.code));
    assert.equal(events.find(e=>e.name==="VISION_ERROR").details.sent,c.sent);
  }
});

test("rejects wrong task, invalid numeric values and unsafe endpoint; no default basis",()=>{
  assert.throws(()=>validateVisionResult({}, "nutrition_label"),/INVALID/);
  assert.throws(()=>validateVisionResult({...result,detected_type:"expiry"},"nutrition_label"),/wrong_task/);
  assert.throws(()=>validateVisionResult({...result,nutrition:{sodium_mg:-1}},"nutrition_label"),/sodium/);
  assert.equal(validateVisionResult({...result,basis:null},"nutrition_label").basis,null);
  assert.equal(visionConfigIssue({...config,endpoint:"http://example.invalid"}),"VISION_CONFIG_INVALID");
  assert.equal(visionConfigIssue({...config,endpoint:"https://example.invalid?key=secret"}),"VISION_CONFIG_INVALID");
});

test("added sugar requires matching explicit text, never total sugar or invented value",()=>{
  for(const raw of ["总糖 5g","添加糖 1g"]){const checked=validateVisionResult({...result,raw_text:raw,nutrition:{added_sugar_g:5}},"nutrition_label");assert.equal(checked.nutrition.added_sugar_g,null)}
  assert.equal(validateVisionResult({...result,raw_text:"添加糖 1g",nutrition:{added_sugar_g:1}},"nutrition_label").nutrition.added_sugar_g,1);
});

test("valid response with missing visible fields is diagnosed low quality, not success accuracy",async()=>{
  const {events,event}=harness();await requestVision(config,"nutrition_label",async()=>image,event,async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({...result,nutrition:{protein_g:3.6}})}}]})));
  assert.ok(events.some(e=>e.name==="VISION_LOW_CONFIDENCE"));
});
