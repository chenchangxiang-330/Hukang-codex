export type NullableNumber = number | null;

export type Nutrients = {
  energyKcal: NullableNumber;
  energyKj: NullableNumber;
  proteinG: NullableNumber;
  fatG: NullableNumber;
  saturatedFatG?: NullableNumber;
  transFatG?: NullableNumber;
  carbohydrateG: NullableNumber;
  totalSugarG: NullableNumber;
  addedSugarG: NullableNumber;
  fiberG: NullableNumber;
  sodiumMg: NullableNumber;
};

export type Product = Nutrients & {
  id: number;
  barcode: string | null;
  rawBarcode: string | null;
  normalizedBarcode: string | null;
  name: string;
  brand: string | null;
  variant: string | null;
  category: string | null;
  netContent: number | null;
  netContentUnit: string | null;
  basisAmount: number;
  basisUnit: string;
  ingredients: string | null;
  imageUri: string | null;
  ingredientsRawText: string | null;
  ingredientsJson: string | null;
  ocrRawText: string | null;
  dataSource: "manual"|"local_ocr"|"open_food_facts"|"online_vision"|"mixed";
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  id: number;
  productId: number;
  productName: string;
  quantity: number;
  purchaseDate: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  opened: boolean;
  openedAt: string | null;
  storageType: string;
  photoUri: string | null;
};

export type NutritionLog = Nutrients & {
  id: number;
  productId: number;
  productName: string;
  date: string;
  time: string;
  amount: number;
  amountUnit: string;
};

export type HealthProfile = {
  completed: boolean;
  age: string;
  sex: "female" | "male" | "other";
  heightCm: string;
  weightKg: string;
  activity: "low" | "medium" | "high";
  goals: string[];
  sound: boolean;
  notifications: boolean;
};

export const emptyProfile: HealthProfile = {
  completed: false,
  age: "",
  sex: "female",
  heightCm: "",
  weightKg: "",
  activity: "medium",
  goals: ["均衡饮食"],
  sound: true,
  notifications: true,
};

export const nutrientFields: { key: keyof Nutrients; label: string; unit: string; target: number }[] = [
  { key: "energyKcal", label: "能量", unit: "kcal", target: 2000 },
  { key: "proteinG", label: "蛋白质", unit: "g", target: 65 },
  { key: "fatG", label: "脂肪", unit: "g", target: 65 },
  { key: "carbohydrateG", label: "碳水化合物", unit: "g", target: 260 },
  { key: "addedSugarG", label: "添加糖", unit: "g", target: 25 },
  { key: "sodiumMg", label: "钠", unit: "mg", target: 2000 },
  { key: "fiberG", label: "膳食纤维", unit: "g", target: 25 },
];

export const zeroNutrients = (): Nutrients => ({
  energyKcal: 0, energyKj: 0, proteinG: 0, fatG: 0, carbohydrateG: 0,
  totalSugarG: 0, addedSugarG: 0, fiberG: 0, sodiumMg: 0, saturatedFatG: 0, transFatG: 0,
});

export const dateKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const offsetDate = (days: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + days); return dateKey(d); };
export const formatDay = (v: string) => { const [y,m,d] = v.split("-").map(Number); return new Date(y,m-1,d); };
export const daysUntil = (v: string) => Math.round((formatDay(v).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000);
export const expiryText = (v: string | null) => { if (!v) return "未设置到期日"; const n=daysUntil(v); return n<0?"已过期":n===0?"今天到期":n<=3?`${n}天内到期`:n<=7?`${n}天内到期`:`剩余${n}天`; };
