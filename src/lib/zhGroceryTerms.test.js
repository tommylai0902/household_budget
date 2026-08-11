// Run: node src/lib/zhGroceryTerms.test.js
import assert from "node:assert";
import { hasChineseChars, translateZhGroceryTerm } from "./zhGroceryTerms.js";

assert.equal(hasChineseChars("雞脾"), true);
assert.equal(hasChineseChars("chicken drumstick"), false);
assert.equal(hasChineseChars(""), false);
assert.equal(hasChineseChars(undefined), false);

// Always an array, even for a single mapping — the caller loops over it.
assert.deepEqual(translateZhGroceryTerm("雞脾"), ["chicken drumstick"]);
// Substring match inside a longer phrase, not just an exact whole-term hit.
assert.deepEqual(translateZhGroceryTerm("今晚想食雞脾"), ["chicken drumstick"]);
// Already English — nothing to translate, not an error.
assert.equal(translateZhGroceryTerm("chicken drumstick"), null);
// Not in the starter list — left null rather than a wrong guess.
assert.equal(translateZhGroceryTerm("薯條"), null);
assert.equal(translateZhGroceryTerm(""), null);
assert.equal(translateZhGroceryTerm(null), null);

// The case this whole mechanism exists for: Flipp prints the same product as
// "GLAD CLING WRAP", "GLAD CLINGWRAP" and "GLAD PLASTIC WRAP" depending on the
// merchant and the week, so one Chinese term has to offer several candidates.
// These are real flyer lines from one region (M5A0E7) inside two weeks.
const REAL_WRAP_LINES = [
  "GLAD CLING WRAP",
  "ALCAN FOIL 50 ft., NON-STICK FOIL 25 ft. GLAD CLINGWRAP 60 m",
  "ALCAN ALUMINUM FOIL, 100', GLAD PLASTIC WRAP, 152 M",
];
const wrapTerms = translateZhGroceryTerm("保鮮紙");
for (const line of REAL_WRAP_LINES) {
  assert.ok(wrapTerms.some((t) => line.toLowerCase().includes(t)), `no candidate matched: ${line}`);
}
// ...without dragging in a recycling bin, which is what the shorter "cling"
// did: "Recycling" contains it.
const NOT_WRAP = "Step N' Sort 3-Compartment Trash & Recycling Bin";
assert.ok(!wrapTerms.some((t) => NOT_WRAP.toLowerCase().includes(t)), "matched a recycling bin");

// Simplified and traditional must not diverge.
assert.deepEqual(translateZhGroceryTerm("保鮮紙"), translateZhGroceryTerm("保鲜纸"));
assert.deepEqual(translateZhGroceryTerm("錫紙"), translateZhGroceryTerm("锡纸"));
for (const [trad, simp] of [["蠔油", "蚝油"], ["洗潔精", "洗洁精"], ["檸檬", "柠檬"], ["薑", "姜"]]) {
  assert.deepEqual(translateZhGroceryTerm(trad), translateZhGroceryTerm(simp), `${trad}/${simp} diverged`);
}

// Longest key wins, not first-declared. "蛋" is a substring of plenty of
// longer keys, and declaration order must not decide the answer.
assert.deepEqual(translateZhGroceryTerm("雞蛋"), ["egg"]);
assert.deepEqual(translateZhGroceryTerm("三文魚"), ["salmon"], "should not fall back to 魚/fish");
assert.deepEqual(translateZhGroceryTerm("免治牛肉"), ["ground beef"], "should not fall back to 牛肉/beef");
assert.deepEqual(translateZhGroceryTerm("椰菜花"), ["cauliflower"], "should not fall back to 椰菜/cabbage");
// Same rule inside a longer sentence, where only substring matching applies.
assert.deepEqual(translateZhGroceryTerm("今晚煮三文魚"), ["salmon"]);

// A short compound noun is never picked apart. 魚露 (fish sauce) contains 魚,
// and guessing "fish" from it returned 25 confident, entirely wrong fish deals
// — worse than admitting the word is unknown.
assert.equal(translateZhGroceryTerm("魚露"), null, "魚露 must not be read as 魚");
assert.equal(translateZhGroceryTerm("豬頸肉"), null, "unknown 3-char compound stays unknown");
assert.equal(translateZhGroceryTerm("腐乳"), null);
// ...but the exact entries those characters belong to still resolve.
assert.deepEqual(translateZhGroceryTerm("魚"), ["fish"]);
assert.deepEqual(translateZhGroceryTerm("豬肉"), ["pork"]);

// No English target may be a substring of a longer unrelated word once the
// caller matches on word boundaries — a bare "egg" is fine, "cling" was not.
const BAD_SUBSTRINGS = ["cling"];
for (const [, en] of Object.entries({ 保鮮紙: translateZhGroceryTerm("保鮮紙") })) {
  for (const t of en) assert.ok(!BAD_SUBSTRINGS.includes(t), `${t} is a known false-positive magnet`);
}

console.log("zhGroceryTerms.js: all checks passed");
