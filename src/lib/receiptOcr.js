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

const TOTAL_LINE = /\btotals?\b|amount due|balance due/i;
// "Subtotal" contains "total" but isn't it; so do the tax lines, the card
// payment echo, and the loyalty-points footer that repeats the amount.
const EXCLUDE_LINE = /sub[\s-]?total|\btax\b|\bhst\b|\bgst\b|\bpst\b|change due|\bcash\b|visa|master|debit|credit card|approved|auth #|thank you|card ?holder|eligible amount|\bpoints\b|item count/i;
// A line that is nothing but an amount, allowing a leading marker letter and
// trailing tax-code letters ("W $7.50 G F" is how T&T prints an item price).
const BARE_AMOUNT = /^[A-Z]?\s*-?\$?\s*(\d{1,5}\.\d{2})\s*[A-Z\s]*$/;
const MONEY_ANYWHERE = /-?\$?\s*(\d{1,5}\.\d{2})(?!\d)/;
// Anchors the merchant search: a street address or a phone number always sits
// just below the store name on a printed receipt.
const ADDRESS_ANCHOR = /\(\d{3}\)\s*\d{3}[-\s]?\d{4}|\b\d{2,6}\s+[\w'.-]+(?:\s+[\w'.-]+)*\s+(?:ave|avenue|st|street|rd|road|blvd|dr|drive|way|hwy)\b/i;
const CURRENCY_SYMBOLS = { "US$": "USD", "C$": "CAD", "HK$": "HKD", CAD: "CAD", USD: "USD", "£": "GBP", "€": "EUR", "¥": "JPY" };

// Amount for a label line: same line if it's there, otherwise the next line
// when that line is nothing but an amount (Vision's column split).
function amountFor(lines, i) {
  const own = MONEY_ANYWHERE.exec(lines[i].replace(TOTAL_LINE, ""));
  if (own) return parseFloat(own[1]);
  const next = lines[i + 1] && BARE_AMOUNT.exec(lines[i + 1]);
  return next ? parseFloat(next[1]) : null;
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

// North-American slash order (MM/DD/YY or MM/DD/YYYY), same assumption csv.js
// makes. A 2-digit year is this century — receipts aren't from 1926.
export function findDate(lines, today) {
  for (const line of lines) {
    const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(line);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    const slash = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/.exec(line);
    if (slash) {
      const yr = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
      return `${yr}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
    }
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
  const junk = (l) => !/[a-z]/i.test(l) || /[$!]/.test(l) || /^\W+$/.test(l);
  if (anchor > 0) {
    const window = lines.slice(Math.max(0, anchor - 5), anchor).filter((l) => !junk(l));
    const branded = window.find((l) => CATEGORY_KEYWORDS.some(([pattern]) => pattern.test(l)));
    const line = branded || window[window.length - 1];
    if (line) return line.slice(0, 60);
  }
  const first = lines.find((l) => !junk(l));
  return first ? first.slice(0, 60) : "";
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
