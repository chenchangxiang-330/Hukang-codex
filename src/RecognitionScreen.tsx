import React from "react";
import NutritionRecognitionScreen from "./NutritionRecognitionScreen";
import TextRecognitionScreen from "./TextRecognitionScreen";

type CreateArgs={photo:string;barcode?:string;source:"local_ocr"|"online_vision"|"mixed";rawText:string;recognitionEvidenceJson?:string;draft:Record<string,string>};
export type RecognitionProps={
  photo:string;barcode?:string;scanMeta?:string;requestedMode:"nutrition"|"ingredients"|"date";
  back:()=>void;onCreate:(value:CreateArgs)=>void;onDate:(expiry?:string,productionDate?:string)=>void;
};
export default function RecognitionScreen(props:RecognitionProps){
  return props.requestedMode==="nutrition"
    ?<NutritionRecognitionScreen key={props.photo} {...props}/>
    :<TextRecognitionScreen key={props.photo} {...props} requestedMode={props.requestedMode}/>;
}
