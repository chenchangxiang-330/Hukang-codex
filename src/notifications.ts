import * as Notifications from "expo-notifications";
import { InventoryItem } from "./types";

Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});
export async function rescheduleExpiryNotifications(items:InventoryItem[]){
  const permission=await Notifications.getPermissionsAsync();
  if(permission.status!=="granted"){ const asked=await Notifications.requestPermissionsAsync(); if(asked.status!=="granted")return false; }
  await Notifications.cancelAllScheduledNotificationsAsync();
  const now=Date.now();
  for(const item of items){ if(!item.expiryDate)continue; const [y,m,d]=item.expiryDate.split("-").map(Number); for(const before of [7,3,1,0]){ const at=new Date(y,m-1,d-before,9,0,0); if(at.getTime()>now) await Notifications.scheduleNotificationAsync({content:{title:"护康到期提醒",body:`${item.productName}${before===0?"今天到期":`还有 ${before} 天到期`}`,data:{inventoryId:item.id}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:at}}); } }
  return true;
}
