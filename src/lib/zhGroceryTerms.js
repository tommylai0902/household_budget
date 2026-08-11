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
  "牛肉": "beef", "牛扒": "steak", "免治牛肉": "ground beef",
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

  /* ---- seafood ---- */
  "蟹": "crab", "龍蝦": "lobster", "龙虾": "lobster", "帶子": "scallop", "带子": "scallop",
  "蜆": "clam", "蚬": "clam", "生蠔": "oyster", "生蚝": "oyster",
  "魚柳": "fish fillet", "鱼柳": "fish fillet", "鱈魚": "cod", "鳕鱼": "cod",
  "吞拿魚": "tuna", "金槍魚": "tuna", "金枪鱼": "tuna",

  /* ---- vegetables ---- */
  "白菜": ["bok choy", "baby bok choy"], "芥蘭": ["gai lan", "chinese broccoli"],
  "芥兰": ["gai lan", "chinese broccoli"], "通菜": ["water spinach", "ong choy"],
  "菠菜": "spinach", "椰菜": "cabbage", "椰菜花": "cauliflower", "西兰花": "broccoli",
  "紅蘿蔔": "carrot", "胡蘿蔔": "carrot", "胡萝卜": "carrot",
  "蘑菇": "mushroom", "冬菇": ["shiitake", "shiitake mushroom"],
  "豆腐": "tofu", "芽菜": ["bean sprout", "sprouts"], "粟米": "corn", "南瓜": "pumpkin", "茄子": "eggplant",
  "辣椒": ["chili pepper", "hot pepper"], "薑": "ginger", "姜": "ginger",
  "蒜頭": "garlic", "蒜头": "garlic", "蔥": ["green onion", "scallion"], "葱": ["green onion", "scallion"],
  "土豆": "potato", "西紅柿": "tomato", "西红柿": "tomato", "黃瓜": "cucumber", "黄瓜": "cucumber",

  /* ---- fruit ---- */
  "士多啤梨": "strawberry", "草莓": "strawberry", "藍莓": "blueberry", "蓝莓": "blueberry",
  "芒果": "mango", "菠蘿": "pineapple", "菠萝": "pineapple", "梨": "pear",
  "奇異果": "kiwi", "奇异果": "kiwi", "車厘子": "cherry", "车厘子": "cherry",
  "檸檬": "lemon", "柠檬": "lemon", "葡萄": "grape", "苹果": "apple",

  /* ---- pantry & seasoning ---- */
  "生抽": "soy sauce", "豉油": "soy sauce", "老抽": ["dark soy sauce", "soy sauce"],
  "蠔油": "oyster sauce", "蚝油": "oyster sauce", "麻油": "sesame oil",
  "食油": ["cooking oil", "canola oil", "vegetable oil"], "橄欖油": "olive oil", "橄榄油": "olive oil",
  "鹽": "salt", "盐": "salt", "糖": "sugar", "醋": "vinegar",
  "麵粉": "flour", "面粉": "flour", "粟粉": "cornstarch", "米粉": ["rice noodle", "rice vermicelli"],

  /* ---- breakfast & snacks ---- */
  "麥皮": ["oatmeal", "oats"], "麦片": ["oatmeal", "oats"], "穀物早餐": "cereal", "谷物早餐": "cereal",
  "果醬": "jam", "果酱": "jam", "花生醬": "peanut butter", "花生酱": "peanut butter", "蜂蜜": "honey",
  "薯片": ["potato chip", "chip"], "餅乾": ["cookie", "biscuit", "cracker"], "饼干": ["cookie", "biscuit", "cracker"],
  "朱古力": "chocolate", "巧克力": "chocolate", "糖果": "candy",

  /* ---- drinks ---- */
  "咖啡": "coffee", "茶": "tea", "果汁": "juice", "汽水": ["soda", "soft drink", "pop"],
  "啤酒": "beer", "樽裝水": "bottled water", "瓶装水": "bottled water",

  /* ---- household ---- */
  "洗潔精": ["dish soap", "dish detergent", "dishwashing liquid"],
  "洗洁精": ["dish soap", "dish detergent", "dishwashing liquid"],
  "洗頭水": "shampoo", "洗发水": "shampoo", "護髮素": "conditioner", "护发素": "conditioner",
  "沐浴露": "body wash", "牙膏": "toothpaste", "牙刷": "toothbrush", "肥皂": "soap",
  "尿片": "diaper", "尿布": "diaper", "濕紙巾": ["wipe", "wet wipe"], "湿纸巾": ["wipe", "wet wipe"],
  "垃圾袋": "garbage bag", "洗衣液": "laundry detergent", "漂白水": "bleach",
  "厕纸": "toilet paper", "纸巾": "paper towel",

  /* ---- simplified variants of the traditional entries above ---- */
  "雞腿": "chicken drumstick", "鸡腿": "chicken drumstick", "鸡髀": "chicken drumstick",
  "鸡胸": "chicken breast", "鸡翅": "chicken wing", "鸡翼": "chicken wing", "全鸡": "whole chicken",
  "雞肉": "chicken", "鸡肉": "chicken", "排骨": ["pork rib", "back rib", "side rib"],
  "猪肉": "pork", "猪扒": "pork chop", "牛排": "steak",
  "鱼": "fish", "虾": "shrimp", "三文鱼": "salmon",
  "鸡蛋": "egg", "奶酪": "cheese", "黃油": "butter", "黄油": "butter", "酸奶": "yogurt",
  "面包": "bread", "面": "noodles",
  // A value may be a list of alternative spellings; the caller searches all of
  // them and merges the results. Flipp spells the same product differently
  // week to week and merchant to merchant — "GLAD CLING WRAP" (Food Basics),
  // "GLAD CLINGWRAP" (No Frills) and "GLAD PLASTIC WRAP" (Fortinos) were all
  // live in one region inside two weeks, so a single fixed string silently
  // misses whichever spelling that week happens to use.
  //
  // Each alternative stays a full word: the shorter "cling" would cover both
  // wrap spellings in one, but it is also a substring of "reCYCLINg" and drags
  // in recycling bins.
  "保鮮紙": ["cling wrap", "clingwrap", "plastic wrap"],
  "保鲜纸": ["cling wrap", "clingwrap", "plastic wrap"],
  "錫紙": ["aluminum foil", "alcan foil"], "锡纸": ["aluminum foil", "alcan foil"],
};

export const hasChineseChars = (s) => /[一-鿿]/.test(s || "");

// Exact match first (the common case — a grocery-list item named just
// "雞脾"), else the first known term found anywhere inside a longer phrase.
// Always returns an array (or null), since one term can map to several
// competing flyer spellings — see ZH_TO_EN above.
// Below this length, a Chinese string is a product name in its own right, not
// a sentence with a product buried in it — so an unknown one must stay unknown
// rather than be guessed at from a character it happens to contain.
const PHRASE_MIN_LENGTH = 5;

export function translateZhGroceryTerm(term) {
  const trimmed = (term || "").trim();
  if (!trimmed) return null;
  let hit = ZH_TO_EN[trimmed];
  if (!hit && trimmed.length >= PHRASE_MIN_LENGTH) {
    // Substring matching is for phrases ("今晚想食雞脾"), never for compound
    // nouns. 魚露 is fish sauce, but it contains 魚, so this branch used to
    // translate it as "fish" and hand back 25 confident, entirely wrong fish
    // deals. A wrong answer delivered confidently is worse than no answer.
    //
    // Longest key wins, not first-declared. Short keys are substrings of longer
    // ones all over this table ("蛋" inside "蛋糕", "魚" inside "三文魚"), so
    // scanning in declaration order would translate 蛋糕 as "egg" purely
    // because 蛋 happens to sit higher up. Ordering the table by hand instead
    // is a trap that springs quietly on the next entry someone adds.
    const key = Object.keys(ZH_TO_EN)
      .filter((zh) => trimmed.includes(zh))
      .sort((a, b) => b.length - a.length)[0];
    if (key) hit = ZH_TO_EN[key];
  }
  if (!hit) return null;
  return Array.isArray(hit) ? hit : [hit];
}
