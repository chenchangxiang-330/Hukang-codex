export type Nutrients = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sodium: number;
};
export type ProductKind = "food" | "medicine";
export type FoodCategory = "fruit" | "vegetable" | "snack" | "other";
export type Food = {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  serving: string;
  nutrients: Nutrients;
  ingredients: string;
  storage: string;
  color: string;
  kind: ProductKind;
  category?: FoodCategory;
};
export type Item = {
  id: string;
  foodId: string;
  expires: string;
  addedAt: string;
  photo?: string;
};
export type Intake = {
  id: string;
  foodId: string;
  servings: number;
  date: string;
};
export type State = {
  version: 1;
  welcomed: boolean;
  sound: boolean;
  demo: boolean;
  inventory: Item[];
  intakes: Intake[];
};
export const foods: Food[] = [
  {
    id: "milk",
    name: "原味纯牛奶",
    subtitle: "一份温柔的日常补给",
    emoji: "🥛",
    serving: "250 mL / 盒",
    color: "#e4f3f2",
    kind: "food",
    category: "other",
    nutrients: { kcal: 160, protein: 8, fat: 9, carbs: 12, sodium: 130 },
    ingredients: "生牛乳。含乳及乳制品。",
    storage: "请以实际包装为准；开封后冷藏并尽快饮用。",
  },
  {
    id: "oats",
    name: "原味燕麦片",
    subtitle: "让早餐多一点从容",
    emoji: "🌾",
    serving: "40 g / 份",
    color: "#e7f1f5",
    kind: "food",
    category: "other",
    nutrients: { kcal: 152, protein: 5, fat: 3, carbs: 26, sodium: 4 },
    ingredients: "燕麦片。可能含麸质，具体以包装为准。",
    storage: "密封存放于阴凉干燥处，避免受潮。",
  },
  {
    id: "nuts",
    name: "每日混合坚果",
    subtitle: "小份量，也有好能量",
    emoji: "🥜",
    serving: "25 g / 袋",
    color: "#e1f1ec",
    kind: "food",
    category: "snack",
    nutrients: { kcal: 155, protein: 4, fat: 13, carbs: 5, sodium: 35 },
    ingredients: "核桃仁、扁桃仁、腰果。含坚果类过敏原。",
    storage: "阴凉干燥保存，开袋后尽快食用。",
  },
  {
    id: "apple",
    name: "红苹果",
    subtitle: "水果库存示例",
    emoji: "🍎",
    serving: "1 个 / 约 200 g",
    color: "#e9f5f1",
    kind: "food",
    category: "fruit",
    nutrients: { kcal: 106, protein: 1, fat: 0, carbs: 28, sodium: 2 },
    ingredients: "苹果。营养数值为演示估算。",
    storage: "阴凉处短期保存，或冷藏延长保存时间。",
  },
  {
    id: "tomato",
    name: "番茄",
    subtitle: "蔬菜库存示例",
    emoji: "🍅",
    serving: "1 个 / 约 150 g",
    color: "#e4f2f0",
    kind: "food",
    category: "vegetable",
    nutrients: { kcal: 27, protein: 1, fat: 0, carbs: 6, sodium: 8 },
    ingredients: "番茄。营养数值为演示估算。",
    storage: "成熟后冷藏，并留意表皮破损或霉变。",
  },
  {
    id: "medicine-demo",
    name: "家庭常备药（示例）",
    subtitle: "仅演示到期管理",
    emoji: "💊",
    serving: "1 盒",
    color: "#e4edf5",
    kind: "medicine",
    nutrients: { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 },
    ingredients: "请以实际药品包装和说明书为准。",
    storage: "严格按照实际说明书标注的温度、避光和防潮条件保存。",
  },
];
export const metrics: {
  key: keyof Nutrients;
  label: string;
  unit: string;
  target: number;
}[] = [
  { key: "kcal", label: "能量", unit: "kcal", target: 2000 },
  { key: "protein", label: "蛋白质", unit: "g", target: 60 },
  { key: "fat", label: "脂肪", unit: "g", target: 65 },
  { key: "carbs", label: "碳水", unit: "g", target: 250 },
  { key: "sodium", label: "钠", unit: "mg", target: 2000 },
];
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function offsetDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateKey(d);
}
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dateKey(dt) === s;
}
export function daysLeft(s: string, today = dateKey()) {
  const utc = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(s) - utc(today)) / 86400000);
}
export function expiryLabel(s: string) {
  const n = daysLeft(s);
  return n < 0
    ? "已过期"
    : n === 0
      ? "今天到期"
      : n <= 3
        ? `${n} 天后到期`
        : `剩余 ${n} 天`;
}
export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function freshState(demo = true): State {
  return {
    version: 1,
    welcomed: false,
    sound: true,
    demo,
    inventory: demo
      ? [
          {
            id: uid(),
            foodId: "milk",
            expires: offsetDate(2),
            addedAt: dateKey(),
          },
          {
            id: uid(),
            foodId: "oats",
            expires: offsetDate(45),
            addedAt: dateKey(),
          },
          {
            id: uid(),
            foodId: "apple",
            expires: offsetDate(6),
            addedAt: dateKey(),
          },
          {
            id: uid(),
            foodId: "tomato",
            expires: offsetDate(3),
            addedAt: dateKey(),
          },
          {
            id: uid(),
            foodId: "medicine-demo",
            expires: offsetDate(180),
            addedAt: dateKey(),
          },
        ]
      : [],
    intakes: [],
  };
}
export function totals(state: State, day = dateKey()): Nutrients {
  const n: Nutrients = state.demo
    ? { kcal: 820, protein: 28, fat: 26, carbs: 112, sodium: 860 }
    : { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 };
  for (const i of state.intakes.filter((i) => i.date === day)) {
    const f = foods.find((f) => f.id === i.foodId);
    if (f)
      for (const k of Object.keys(n) as (keyof Nutrients)[])
        n[k] += f.nutrients[k] * i.servings;
  }
  return n;
}
export function parseState(raw: string): State {
  const s = JSON.parse(raw);
  if (
    s.version !== 1 ||
    typeof s.welcomed !== "boolean" ||
    typeof s.sound !== "boolean" ||
    typeof s.demo !== "boolean" ||
    !Array.isArray(s.inventory) ||
    !Array.isArray(s.intakes)
  )
    throw Error("存档格式无效");
  for (const i of s.inventory)
    if (
      !i ||
      typeof i.id !== "string" ||
      !foods.some((f) => f.id === i.foodId) ||
      !validDate(i.expires) ||
      !validDate(i.addedAt) ||
      (i.photo !== undefined && typeof i.photo !== "string")
    )
      throw Error("库存数据无效");
  for (const i of s.intakes)
    if (
      !i ||
      typeof i.id !== "string" ||
      !foods.some((f) => f.id === i.foodId) ||
      foods.find((f) => f.id === i.foodId)?.kind !== "food" ||
      !validDate(i.date) ||
      !Number.isFinite(i.servings) ||
      i.servings <= 0
    )
      throw Error("摄入数据无效");
  return s;
}
