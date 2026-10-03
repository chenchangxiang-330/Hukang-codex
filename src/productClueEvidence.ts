export type ProductClues={brand:string;productName:string;variant:string;quantity:string;category:string;keywords:string[];barcode:string};
export type ProductClueField="brand"|"productName"|"variant"|"quantity"|"category";
export type ProductClueConflict={field:ProductClueField;label:string;local:string;vision:string};
export type ProductClueChoices=Partial<Record<ProductClueField,"local"|"vision"|"blank">>;
type VisionClues={brand?:string|null;product_name?:string|null;variant?:string|null;quantity?:string|null;category?:string|null;visible_text?:string[];barcode?:string|null};
const comparable=(v:string)=>v.trim().toLowerCase().replace(/\s+/g,"");
const fields:[ProductClueField,keyof VisionClues,string][]=[["brand","brand","品牌"],["productName","product_name","商品名"],["variant","variant","口味 / 款式"],["quantity","quantity","规格"],["category","category","类别"]];

export function mergeProductClues(local:ProductClues,vision?:VisionClues){
  const clues={...local,keywords:[...local.keywords]},conflicts:ProductClueConflict[]=[];
  for(const[field,remoteField,label]of fields){
    const remote=vision?.[remoteField];if(typeof remote!=="string"||!remote.trim())continue;
    if(!local[field].trim())clues[field]=remote.trim();
    else if(comparable(local[field])!==comparable(remote)){conflicts.push({field,label,local:local[field],vision:remote.trim()});clues[field]=""}
  }
  const blocked=conflicts.flatMap(c=>[comparable(c.local),comparable(c.vision)]).filter(Boolean);
  clues.keywords=[...local.keywords,...(vision?.visible_text??[])].filter(text=>text&&!blocked.some(value=>comparable(text).includes(value))).filter((text,index,all)=>all.indexOf(text)===index).slice(0,10);
  // A photographed/OCR/model number is never allowed to overwrite scanner data.
  clues.barcode=local.barcode;
  return{clues,conflicts};
}

export function resolveProductClues(base:ProductClues,conflicts:ProductClueConflict[],choices:ProductClueChoices){
  const clues={...base,keywords:[...base.keywords]};let ready=true;
  for(const conflict of conflicts){const choice=choices[conflict.field];if(!choice){ready=false;clues[conflict.field]=""}else clues[conflict.field]=choice==="local"?conflict.local:choice==="vision"?conflict.vision:""}
  return{clues,ready};
}
