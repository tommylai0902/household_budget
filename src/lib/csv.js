// Pure CSV parsing + category guessing for the batch-import feature. No
// Supabase, no React — stays unit-testable via csv.test.js.

// Minimal RFC4180-ish line parser: handles quoted fields (with escaped "" and
// embedded commas). Good enough for bank/card CSV exports; not a full spec parser.
function parseCsvLine(line) {
  const cells = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

// MM/DD/YYYY (common in North American card exports) and YYYY-MM-DD pass through
// as-is; anything else goes through Date() as a best effort. A row whose date
// still can't be parsed falls back to `today` rather than being dropped — easier
// to fix one visibly-wrong date in the preview than to explain a vanished row.
export function normalizeDate(raw, today) {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) { const [, mo, da, yr] = us; return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`; }
  const d = new Date(s);
  return isNaN(d) ? today : d.toISOString().slice(0, 10);
}

const HEADER_ALIASES = {
  date: ["date", "transaction date", "posted date", "post date"],
  description: ["description", "memo", "merchant", "details", "payee"],
  amount: ["amount", "debit", "charge", "amount debit"],
};
const findColumn = (header, keys) => keys.map((k) => header.indexOf(k)).find((i) => i >= 0) ?? -1;

// Returns { date, description, amount } rows. Amount is always positive — this
// is an expense importer, direction (debit vs credit) isn't modelled, so a
// refund/credit row imports as a positive charge and needs editing by hand.
export function parseCsvText(text, today = new Date().toISOString().slice(0, 10)) {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateCol = findColumn(header, HEADER_ALIASES.date);
  const descCol = findColumn(header, HEADER_ALIASES.description);
  const amountCol = findColumn(header, HEADER_ALIASES.amount);
  const hasHeader = dateCol >= 0 && descCol >= 0 && amountCol >= 0;
  const [dCol, dsCol, aCol] = hasHeader ? [dateCol, descCol, amountCol] : [0, 1, 2];
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cells = parseCsvLine(line);
    const amount = Math.abs(parseFloat((cells[aCol] || "").replace(/[^0-9.-]/g, "")) || 0);
    return { date: normalizeDate(cells[dCol], today), description: (cells[dsCol] || "").trim(), amount };
  }).filter((r) => r.description && r.amount > 0);
}

// description -> candidate category *names* (English canonical; matched against
// either language column since category names are language-neutral in this app —
// see db.js's toRowCategory). First pattern that matches wins; first candidate
// name actually present in the ledger's own categories wins. No hit => left
// uncategorised, same as it would show for a manual entry.
const CATEGORY_KEYWORDS = [
  [/uber|lyft|taxi|transit|parking|\bgas\b|petro|shell|esso/i, ["Transport"]],
  [/doordash|uber\s?eats|skipthedishes|grubhub/i, ["Food Delivery"]],
  [/starbucks|mcdonald|tim hortons|restaurant|cafe|coffee/i, ["Dine in", "Food"]],
  [/walmart|costco|superstore|no frills|loblaws|sobeys|t&t|grocery|supermarket/i, ["Grocery"]],
  [/amazon|shopping|best buy/i, ["Shopping"]],
  [/netflix|spotify|disney\+|subscription/i, ["Subscriptions", "Entertainment"]],
  [/rent|landlord/i, ["Rent"]],
  [/hydro|electric|water|utilities|internet|rogers|bell|telus/i, ["Utilities"]],
  [/air\s?canada|westjet|flight|airline/i, ["Flights"]],
  [/airbnb|hotel|marriott|accommodation/i, ["Accommodation"]],
];
export function guessCategoryId(description, categories) {
  const desc = (description || "").toLowerCase();
  for (const [pattern, candidates] of CATEGORY_KEYWORDS) {
    if (!pattern.test(desc)) continue;
    for (const name of candidates) {
      const match = categories.find((c) =>
        (c.name || "").toLowerCase() === name.toLowerCase() || (c.nameZh || "").toLowerCase() === name.toLowerCase());
      if (match) return match.id;
    }
  }
  return null;
}
