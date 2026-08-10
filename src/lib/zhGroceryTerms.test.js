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

console.log("zhGroceryTerms.js: all checks passed");
