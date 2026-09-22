import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyProfile, HealthProfile } from "./types";
const KEY="@hukang/profile/v1";
const SCAN_KEY="@hukang/scanner/v1";
export type ScannerPreferences={onlineEnhancement:boolean;onlineConsentAsked:boolean;developerMode:boolean};
const scannerDefaults:ScannerPreferences={onlineEnhancement:false,onlineConsentAsked:false,developerMode:false};
export async function loadProfile():Promise<HealthProfile>{ const raw=await AsyncStorage.getItem(KEY); if(!raw)return emptyProfile; try{return {...emptyProfile,...JSON.parse(raw)}}catch{return emptyProfile} }
export async function saveProfile(p:HealthProfile){ await AsyncStorage.setItem(KEY,JSON.stringify(p)); }
export async function clearProfile(){ await AsyncStorage.removeItem(KEY); }
export async function loadScannerPreferences():Promise<ScannerPreferences>{const raw=await AsyncStorage.getItem(SCAN_KEY);if(!raw)return scannerDefaults;try{return{...scannerDefaults,...JSON.parse(raw)}}catch{return scannerDefaults}}
export async function saveScannerPreferences(value:ScannerPreferences){await AsyncStorage.setItem(SCAN_KEY,JSON.stringify(value))}
