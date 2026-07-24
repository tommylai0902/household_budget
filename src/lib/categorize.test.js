// Self-check for merchant category learning. Run: node src/lib/categorize.test.js
import assert from "node:assert";
import { suggestCategoryId } from "./categorize.js";

const expenseAt = (description, categoryId) => ({ description, categoryId });

// Fewer than 3 matches -> no suggestion yet.
assert.equal(suggestCategoryId("Starbucks", [expenseAt("Starbucks", "c1"), expenseAt("Starbucks", "c1")]), null);

// Exactly 3 matches, same category -> suggest it.
assert.equal(
  suggestCategoryId("Starbucks", [expenseAt("Starbucks", "c1"), expenseAt("Starbucks", "c1"), expenseAt("Starbucks", "c1")]),
  "c1",
);

// Case/whitespace-insensitive match.
assert.equal(
  suggestCategoryId("  STARBUCKS  ", [expenseAt("Starbucks", "c1"), expenseAt("starbucks", "c1"), expenseAt("Starbucks", "c1")]),
  "c1",
);

// Unrelated descriptions and rows with no category don't count.
assert.equal(
  suggestCategoryId("Starbucks", [expenseAt("Starbucks", "c1"), expenseAt("Starbucks", null), expenseAt("Other shop", "c2")]),
  null,
);

// Split history (2 vs 1) still under threshold on the winner -> null.
assert.equal(
  suggestCategoryId("Starbucks", [expenseAt("Starbucks", "c1"), expenseAt("Starbucks", "c1"), expenseAt("Starbucks", "c2")]),
  null,
);

// Empty description never matches.
assert.equal(suggestCategoryId("   ", [expenseAt("Starbucks", "c1")]), null);

console.log("categorize.js: all checks passed");
