// A small Chinese→English lookup for common household grocery items, used as
// a fallback (api/scan-deals.js) when a Chinese-typed grocery-list item finds
// nothing in the flyer_items mirror. Most flyers are printed in English only
// (No Frills, Metro, T&T's own flyer text among them); a handful of ethnic
// grocers' flyers ARE in Chinese (Foody World, Yuan Ming, Seasons Food
// Market — confirmed against real mirrored data) and match directly without
// ever needing this. Starter set covering common household vocabulary —
// extend as real search misses turn up gaps, the same way csv.js's
// CATEGORY_KEYWORDS grew.
const ZH_TO_EN = {
  "雞脾": "chicken drumstick", "雞髀": "chicken drumstick", "雞胸": "chicken breast",
  "雞翼": "chicken wing", "全雞": "whole chicken",
  "豬肉": "pork", "豬扒": "pork chop", "免治豬肉": "ground pork", "豬腩肉": "pork belly",
  "牛肉": "beef", "牛扒": "beef steak", "免治牛肉": "ground beef",
  "魚": "fish", "蝦": "shrimp", "三文魚": "salmon",
  "牛奶": "milk", "淡奶": "evaporated milk", "椰奶": "coconut milk",
  "芝士": "cheese", "牛油": "butter", "乳酪": "yogurt",
  "雞蛋": "egg", "蛋": "egg",
  "麵包": "bread", "米": "rice", "麵": "noodles", "意粉": "pasta",
  "薯仔": "potato", "洋葱": "onion", "番茄": "tomato", "青瓜": "cucumber",
  "生菜": "lettuce", "菜心": "choy sum", "西蘭花": "broccoli",
  "橙": "orange", "蘋果": "apple", "香蕉": "banana", "西瓜": "watermelon", "提子": "grape",
  "可樂": "coke", "雪糕": "ice cream",
  "廁紙": "toilet paper", "洗衣粉": "laundry detergent", "紙巾": "paper towel",
};

export const hasChineseChars = (s) => /[一-鿿]/.test(s || "");

// Exact match first (the common case — a grocery-list item named just
// "雞脾"), else the first known term found anywhere inside a longer phrase.
export function translateZhGroceryTerm(term) {
  const trimmed = (term || "").trim();
  if (!trimmed) return null;
  if (ZH_TO_EN[trimmed]) return ZH_TO_EN[trimmed];
  const hit = Object.entries(ZH_TO_EN).find(([zh]) => trimmed.includes(zh));
  return hit ? hit[1] : null;
}
