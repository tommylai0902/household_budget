// Run: node src/lib/zhGroceryTerms.test.js
import assert from "node:assert";
import { hasChineseChars, translateZhGroceryTerm } from "./zhGroceryTerms.js";

assert.equal(hasChineseChars("雞脾"), true);
assert.equal(hasChineseChars("chicken drumstick"), false);
assert.equal(hasChineseChars(""), false);
assert.equal(hasChineseChars(undefined), false);

assert.equal(translateZhGroceryTerm("雞脾"), "chicken drumstick");
// Substring match inside a longer phrase, not just an exact whole-term hit.
assert.equal(translateZhGroceryTerm("今晚想食雞脾"), "chicken drumstick");
// Already English — nothing to translate, not an error.
assert.equal(translateZhGroceryTerm("chicken drumstick"), null);
// Not in the starter list — left null rather than a wrong guess.
assert.equal(translateZhGroceryTerm("薯條"), null);
assert.equal(translateZhGroceryTerm(""), null);
assert.equal(translateZhGroceryTerm(null), null);

console.log("zhGroceryTerms.js: all checks passed");
