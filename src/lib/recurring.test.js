// Self-check for the recurring date logic. Run: node src/lib/recurring.test.js
// Pure functions only — no Supabase — so this stays a plain assert script.
import assert from "node:assert";
import { nextOccurrence, dueOccurrences } from "./recurring.js";

// nextOccurrence steps by the right unit.
assert.equal(nextOccurrence("2026-01-01", "weekly"), "2026-01-08");
assert.equal(nextOccurrence("2026-01-01", "monthly"), "2026-02-01");
assert.equal(nextOccurrence("2026-01-01", "yearly"), "2027-01-01");
// Month-end rolls forward the way JS Date does (documented ceiling, not a surprise).
assert.equal(nextOccurrence("2026-01-31", "monthly"), "2026-03-03");

// dueOccurrences is inclusive of start and of today, exclusive of the future.
assert.deepEqual(
  dueOccurrences("2026-01-01", "monthly", "2026-03-15"),
  ["2026-01-01", "2026-02-01", "2026-03-01"],
);
// A start date in the future yields nothing.
assert.deepEqual(dueOccurrences("2026-12-01", "monthly", "2026-06-01"), []);
// Exactly-today counts.
assert.deepEqual(dueOccurrences("2026-06-01", "weekly", "2026-06-01"), ["2026-06-01"]);
// The cap holds instead of looping forever.
assert.equal(dueOccurrences("1900-01-01", "weekly", "2100-01-01", 5).length, 5);

console.log("recurring.js: all checks passed");
