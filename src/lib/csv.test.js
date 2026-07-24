// Self-check for CSV import parsing. Run: node src/lib/csv.test.js
import assert from "node:assert";
import { parseCsvText, normalizeDate, guessCategoryId } from "./csv.js";

// Header detected, standard format, including a quoted field with an embedded comma.
const withHeader = 'Date,Description,Amount\n2026-07-01,UBER TRIP 123,12.50\n07/15/2026,"Costco Wholesale, Store 42",88.10';
const rows = parseCsvText(withHeader, "2026-07-23");
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], { date: "2026-07-01", description: "UBER TRIP 123", amount: 12.5 });
assert.deepEqual(rows[1], { date: "2026-07-15", description: "Costco Wholesale, Store 42", amount: 88.1 });

// No recognisable header -> falls back to positional date,description,amount.
assert.deepEqual(
  parseCsvText("2026-06-01,No Frills,45.20", "2026-07-23"),
  [{ date: "2026-06-01", description: "No Frills", amount: 45.2 }],
);

// Blank/zero-amount rows are dropped, not imported as junk.
assert.equal(parseCsvText("Date,Description,Amount\n2026-07-01,,0\n2026-07-02,Valid,10", "2026-07-23").length, 1);

// Negative (credit) amounts still import as a positive charge.
assert.equal(parseCsvText("Date,Description,Amount\n2026-07-01,Refund,-20", "2026-07-23")[0].amount, 20);

// Date normalisation.
assert.equal(normalizeDate("2026-01-05", "2000-01-01"), "2026-01-05");
assert.equal(normalizeDate("1/5/2026", "2000-01-01"), "2026-01-05");
assert.equal(normalizeDate("not a date", "2000-01-01"), "2000-01-01");

// Category guessing matches against the ledger's real categories, not a fixed list.
const cats = [{ id: "c1", name: "Transport", nameZh: "交通" }, { id: "c2", name: "Grocery", nameZh: "雜貨" }];
assert.equal(guessCategoryId("UBER TRIP 123", cats), "c1");
assert.equal(guessCategoryId("COSTCO WHOLESALE", cats), "c2");
assert.equal(guessCategoryId("SOME RANDOM MERCHANT", cats), null);
// No matching category in THIS ledger (no "Rent" here) -> null, not a wrong guess.
assert.equal(guessCategoryId("MONTHLY RENT PAYMENT", cats), null);

console.log("csv.js: all checks passed");
