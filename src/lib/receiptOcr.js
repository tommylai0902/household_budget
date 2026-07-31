// Pure regex parsing of Cloud Vision's OCR'd receipt text — the "regex first"
// half of the Vision+regex/Gemini-fallback pipeline (see api/scan-receipt.js).
// No network, no Supabase: stays unit-testable via receiptOcr.test.js.
//
// The thing that shapes every function here: Vision's `fullTextAnnotation.text`
// does NOT preserve the receipt's visual columns. A line printed as
// "TOTAL          $31.64" comes back as "TOTAL" on one line and "$31.64" on the
// next, because Vision reads in blocks. So every label→amount lookup has to
// accept the amount on the following line too.
//
// Anything this can't pin down confidently returns null, and the caller falls
// back to asking Gemini to read the image directly. Null is a feature: a wrong
// total silently prefilled is worse than spending one Gemini call.

import { CATEGORY_KEYWORDS } from "./csv.js";

// "Amount" counts: a card terminal slip often has no "TOTAL" at all and labels
// the figure that way (Shoppers' gift-card slip), and where both appear the
// last-one-wins rule below still lands on the real total.
const TOTAL_LINE = /\btotals?\b|\bamounts?\b|balance due/i;
// "Subtotal" contains "total" but isn't it; so do the tax lines, the card
// payment echo, and the loyalty-points footer that repeats the amount.
const EXCLUDE_LINE = /sub[\s-]?total|\btax\b|\bhst\b|\bgst\b|\bpst\b|change due|\bcash\b|visa|master|debit|credit card|approved|auth #|thank you|card ?holder|eligible amount|\bpoints\b|item count/i;
// A line that is nothing but an amount, allowing a leading marker letter and
// trailing tax-code letters ("W $7.50 G F" is how T&T prints an item price),
// or a leading colon where the value column keeps its separator (": $100.00").
const BARE_AMOUNT = /^[:\s]*[A-Z]?\s*-?\$?\s*(\d{1,5}\.\d{2})\s*[A-Z\s]*$/;
const MONEY_ANYWHERE = /-?\$?\s*(\d{1,5}\.\d{2})(?!\d)/;
// Anchors the merchant search: a street address or a phone number always sits
// just below the store name on a printed receipt.
const ADDRESS_ANCHOR = /\(\d{3}\)\s*\d{3}[-\s]?\d{4}|\b\d{2,6}\s+[\w'.-]+(?:\s+[\w'.-]+)*\s+(?:ave|avenue|st|street|rd|road|blvd|dr|drive|way|hwy)\b/i;
const CURRENCY_SYMBOLS = { "US$": "USD", "C$": "CAD", "HK$": "HKD", CAD: "CAD", USD: "USD", "£": "GBP", "€": "EUR", "¥": "JPY" };

// Lines that name a money figure. Used to measure how far down its own column
// a label sits — ingredient/description text must not join that run or the
// position stops lining up with the amounts.
const MONEY_LABEL = /sub[\s-]?total|\btotals?\b|\bamounts?\b|\btax\b|\bhst\b|\bgst\b|\bpst\b|balance due|\bchange\b|\bcash\b|tender/i;
const LOOKAHEAD = 25; // No Frills wedges the whole card-transaction block between the two columns

// Amount for a label line. Same line if it's printed there — but Vision often
// stacks a whole column of labels and then the matching column of amounts:
//
//   Subtotal / Tax / Total / Molasses, / $17.98 / $2.34 / $20.32
//
// and the gap between the two columns can be long: No Frills prints the card
// transaction details (a dozen lines) before the amounts finally appear. So
// rather than tolerating N stray lines, look ahead for the first run of
// amounts at least as long as the label column — a shorter run means the
// columns don't correspond and this isn't the matching one.
//
// The picked figure must also be the largest in its run: a grand total is by
// definition no smaller than the subtotal and tax it's stacked with, so
// anything else means the alignment is wrong. Failing that check returns null
// and the receipt goes to Gemini, which beats prefilling a wrong amount.
function amountFor(lines, i) {
  const own = MONEY_ANYWHERE.exec(lines[i].replace(TOTAL_LINE, ""));
  if (own) return parseFloat(own[1]);

  let start = i;
  while (start > 0 && MONEY_LABEL.test(lines[start - 1]) && !MONEY_ANYWHERE.test(lines[start - 1])) start--;
  const labelCount = i - start + 1;
  const position = i - start;

  let run = [];
  for (let j = i + 1; j < Math.min(lines.length, i + 1 + LOOKAHEAD); j++) {
    const m = BARE_AMOUNT.exec(lines[j]);
    if (m) { run.push(parseFloat(m[1])); continue; }
    if (run.length >= labelCount) break;
    run = [];
  }
  if (run.length < labelCount) return null;
  const picked = run[position];
  return picked === Math.max(...run) ? picked : null;
}

// Last matching "TOTAL"-ish line wins — subtotal and tax print above it.
export function findTotal(lines) {
  let total = null;
  for (let i = 0; i < lines.length; i++) {
    if (EXCLUDE_LINE.test(lines[i]) || !TOTAL_LINE.test(lines[i])) continue;
    const amt = amountFor(lines, i);
    if (amt != null) total = amt;
  }
  return total;
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAME = MONTHS.join("|");
// "Apr 17,2026" and "17 Apr 2026". Worth handling separately from the numeric
// forms because falling through to `today` here is silent: the form gets
// prefilled with the wrong date and nothing looks broken.
const MONTH_FIRST = new RegExp(`\\b(${MONTH_NAME})[a-z]*\\.?\\s+(\\d{1,2})\\s*,?\\s*(\\d{4})\\b`, "i");
const DAY_FIRST = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_NAME})[a-z]*\\.?\\s*,?\\s*(\\d{4})\\b`, "i");
const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

// North-American slash order (MM/DD/YY or MM/DD/YYYY), same assumption csv.js
// makes, plus year-first forms. A 2-digit year is this century — receipts
// aren't from 1926.
//
// A month over 12 means the guess was wrong, not that the date is exotic: No
// Frills prints its card timestamp as "26/04/15" (year first), which read as
// MM/DD/YY yields month 26. Those are skipped rather than coerced, and the
// scan continues — that same receipt prints an unambiguous "2026/04/15"
// further down.
export function findDate(lines, today) {
  for (const line of lines) {
    const dashed = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(line);
    if (dashed) return iso(dashed[1], dashed[2], dashed[3]);
    const yearFirst = /\b(\d{4})\/(\d{1,2})\/(\d{1,2})\b/.exec(line);
    if (yearFirst) return iso(yearFirst[1], yearFirst[2], yearFirst[3]);
    const named = MONTH_FIRST.exec(line);
    if (named) return iso(named[3], monthIndex(named[1]), named[2]);
    const dayNamed = DAY_FIRST.exec(line);
    if (dayNamed) return iso(dayNamed[3], monthIndex(dayNamed[2]), dayNamed[1]);
    const slash = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(line);
    if (!slash) continue;
    const [, mo, da, yr] = slash;
    if (+mo > 12 || +da > 31) continue;
    return iso(yr.length === 2 ? `20${yr}` : yr, mo, da);
  }
  return today;
}

// The store name is the line just above the address/phone block — NOT the first
// line, which on a real receipt is as likely to be a loyalty-programme adfor
// ("NOT A MEMBER YET? DOWNLOAD & JOIN NOW!"). Within that small window, a line
// matching a known merchant keyword wins over merely being closest, so
// "T&T Supermarket" beats the branch label "Fairview Mall Store" printed under it.
export function findMerchant(lines) {
  const anchor = lines.findIndex((l) => ADDRESS_ANCHOR.test(l));
  // A line opening with a store number is the branch, not the business —
  // "0658 AURORA STORE" sits directly under "LCBO". Three digits, so a name
  // that genuinely starts with a digit ("7-Eleven") isn't caught.
  const junk = (l) => !/[a-z]/i.test(l) || /[$!]/.test(l) || /^\W+$/.test(l) || /^\d{3,}\b/.test(l);
  // A thermal receipt photographed at an angle picks up ink bleeding through
  // from the back, which Vision faithfully reads as gibberish tacked onto the
  // store line ("ROCCO'S NO FRILLS #3643 mutated yom sibnodeM"). The store
  // number starts the junk often enough to cut there.
  const clean = (l) => l.split("#")[0].trim().slice(0, 60);
  if (anchor > 0) {
    const window = lines.slice(Math.max(0, anchor - 5), anchor).filter((l) => !junk(l));
    const branded = window.find((l) => CATEGORY_KEYWORDS.some(([pattern]) => pattern.test(l)));
    const line = branded || window[window.length - 1];
    if (line) return clean(line);
  }
  const first = lines.find((l) => !junk(l));
  return first ? clean(first) : "";
}

// ponytail: always empty. Vision's block reading scrambles the name↔price
// order (T&T prints 3 item names, then "SUB TOTAL", THEN two of the three
// prices), so pairing them by position is a guess, and a wrong price attached
// to the wrong item is worse than none — the app already treats an empty items
// list as "not legible". Revisit with several real receipts in hand if
// per-item splitting turns out to be missed; the pairing rule needs more than
// one sample to be worth writing.
export function findItems() {
  return [];
}

export function findCurrency(text) {
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) if (text.includes(sym)) return code;
  return "";
}

// Same keyword table the CSV importer uses, adapted to plain category-name
// strings (scan-receipt only gets names from the client, not full rows).
export function matchCategoryName(text, categoryNames) {
  const desc = (text || "").toLowerCase();
  for (const [pattern, candidates] of CATEGORY_KEYWORDS) {
    if (!pattern.test(desc)) continue;
    const hit = candidates.find((name) => categoryNames.some((c) => c.toLowerCase() === name.toLowerCase()));
    if (hit) return categoryNames.find((c) => c.toLowerCase() === hit.toLowerCase());
  }
  return null;
}

// Returns the same shape scan-receipt.js's Gemini path returns, or null when
// no confident total (or merchant line) was found — that null is the signal
// to fall back to Gemini rather than save a guess that might be wrong.
export function parseReceiptText(text, { today, categoryNames = [] } = {}) {
  const lines = (text || "").split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const amount = findTotal(lines);
  if (amount == null) return null;
  const description = findMerchant(lines);
  if (!description) return null;
  return {
    description,
    amount,
    currency: findCurrency(text),
    date: findDate(lines, today),
    category: matchCategoryName(description, categoryNames) || "",
    items: findItems(),
  };
}
