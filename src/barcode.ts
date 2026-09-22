export type NormalizedBarcode={raw:string;normalized:string;candidates:string[]};
export function normalizeBarcode(value:string):NormalizedBarcode{
  const raw=value,clean=value.trim().replace(/[\s-]+/g,"").replace(/[^0-9A-Za-z]/g,"");
  const candidates=new Set<string>();if(clean)candidates.add(clean);
  if(/^\d+$/.test(clean)){const stripped=clean.replace(/^0+(?=\d)/,"");if(stripped)candidates.add(stripped);if(clean.length===12)candidates.add(`0${clean}`);if(clean.length===13&&clean.startsWith("0"))candidates.add(clean.slice(1));}
  const normalized=[...candidates].sort((a,b)=>b.length-a.length)[0]??"";
  return{raw,normalized,candidates:[normalized,...[...candidates].filter(x=>x!==normalized)]};
}
