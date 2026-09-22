import AsyncStorage from "@react-native-async-storage/async-storage";
import { State, parseState } from "./model";
const KEY = "@hukang/local/v1";
export async function loadState() {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === null ? null : parseState(raw);
}
export async function saveState(state: State) {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}
