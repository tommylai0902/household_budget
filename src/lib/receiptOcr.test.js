// Self-check for receipt OCR-text parsing. Run: node src/lib/receiptOcr.test.js
//
// The fixture is real Cloud Vision output from a real T&T receipt, kept
// verbatim — including the loyalty ad above the store name and the way Vision
// splits "TOTAL" from "$31.64" onto separate lines. A synthetic receipt has
// neither problem, which is exactly why the first version of this parser
// passed its tests and still failed on the first real photo.
import assert from "node:assert";
import { findTotal, findDate, findMerchant, findCurrency, matchCategoryName, parseReceiptText } from "./receiptOcr.js";

const tnt = `NOT A MEMBER YET? DOWNLOAD & JOIN NOW!
立即下載APP,加入大統華積分獎勵計劃!
.GET EXCLUSIVE OFFERS
AND EARN REWARDS
ENJOY ONLINE GROCERY
DELIVERY
*獨家優惠和積分獎勵
·生鮮商品配送到家
T&T Supermarket
Fairview Mall Store
Unit 1115, 1800 SHEPPARD AVE E, NORTH YORK, ON M2J 5A7
Ph: (416) 493-8113 / Gst# 135747137RT
07/30/26 5:39:59 PM
35LANE01 SC001
***040325998
$0.00
FOOD
(SALE) SPICY BEEF SHANK W/PARSLEY
W $7.50 G F
CRISPY PAPA CHICKEN GARLIC
SEASONED FISH SKIN GREENPEPPER
Points 20
SUB TOTAL
W $15.00 G P
W $5.50 G F
$0.00
$28.00
HST (TOTAL GST+PST)
$3.64
TOTAL
$31.64
Master
$31.64
Points in this transaction: 20
Points balance
: 1500
Item count: 3
Total
Ref #: 53
CARDHOLDER ACKNOWLEDGES RECEIPT
OF GOODS AND/OR SERVICES IN THE
AMOUNT OF THE TOTAL SHOWN ABOVE
Thank You
Please Come Again!
Eligible amount for point calculation: $28.00`;

const lines = tnt.split("\n");

// The total sits on the line AFTER its label, and must beat SUB TOTAL ($28.00),
// HST ($3.64), the card echo, and the later bare "Total" in the payment block.
assert.equal(findTotal(lines), 31.64);
// 2-digit year, and the timestamp line must win over the store's phone number.
assert.equal(findDate(lines, "2000-01-01"), "2026-07-30");
// Not the loyalty ad on line 1, and not the branch label printed underneath.
assert.equal(findMerchant(lines), "T&T Supermarket");

const cats = ["Transport", "Grocery"];
assert.equal(matchCategoryName("T&T Supermarket", cats), "Grocery");
assert.equal(matchCategoryName("SOME RANDOM MERCHANT", cats), null);
assert.equal(findCurrency("Total C$15.56"), "CAD");
assert.equal(findCurrency("Total $15.56"), ""); // bare $ is ambiguous, left blank rather than guessed

const parsed = parseReceiptText(tnt, { today: "2000-01-01", categoryNames: cats });
assert.deepEqual(parsed, {
  description: "T&T Supermarket",
  amount: 31.64,
  currency: "",
  date: "2026-07-30",
  category: "Grocery",
  items: [], // deliberate — see findItems()
});

// Second real fixture, a restaurant bill. Vision stacked the WHOLE label
// column and then the whole amount column, with a stray ingredient line
// ("Molasses,") wedged between them — so "Total" is followed by text, not by
// its own figure, and the amount has to be found by position instead.
const tahinis = `TAHINI'S
Tahini's
333 King St E
Toronto.
ON M5A 3X5
1949 - Take Out
Server: CASH PM 1
Check #235
Ordered:
Quick
2026-04-14 6:53 p.m.
2 Tuesday: Regular
Chicken/Gyro Wrap
$17.98
Garlic, Tomatoes. Pickles,
Tahini, Pom.
Parsley
Medium Hot
Subtotal
Tax
Total
Molasses,
$17.98
$2.34
$20.32
Credit Card
Contactless
Visa
XXXXXXXX4945
Transaction Type
Sale
Approval Code
00434N
Thank you for choosing
Tahini's!
www.tahinis.com`;

assert.deepEqual(parseReceiptText(tahinis, { today: "2000-01-01", categoryNames: cats }), {
  description: "Tahini's",
  amount: 20.32, // the 3rd amount, matching "Total" being the 3rd money label
  currency: "",
  date: "2026-04-14",
  category: "", // no keyword for this merchant — left blank, not guessed
  items: [],
});

// Third real fixture, a supermarket receipt photographed with ink bleeding
// through from the back — Vision reads that as gibberish interleaved with the
// real text. Its two hard parts: a dozen lines of card-transaction detail sit
// between the label column and the amount column, and the card timestamp
// "26/04/15" is year-first, which read as MM/DD/YY would give month 26.
const noFrills = `QNOFRILLS
lonipho rili emula
ROCCO'S NO FRILLS #3643 mutated yom sibnodeM
200 FRONT STREET EAST lo avob El nidiw bouter
22-DAIRY
3.0% PLAIN
LARGE EGGS
27-PRODUCE 42 ol
MRJ
3.93
NNNI MUSHROOMS B MRJ 5.00
1.145 kg Net @ $8.80/kg nigho'bagolledms 10.08
100 Pts
400 Pts
SUBTOTAL
TOTAL
Trans. Type: PURCHASE
Account: VISA
CAD$ 25.01
Card Type: CREDIT
Card Number:
************4945 P
DateTime:
26/04/15 18:41:08
Ref. #:
252190
Auth #:
03306N
25.01
25.01
Visa Credit qis lonipio diw amute
00 APPROVED THANK YOU
GST # 88624-0324 RT0001
VISIT US AT WWW.NOFRILLS.CA
2026/04/15`;

assert.deepEqual(parseReceiptText(noFrills, { today: "2000-01-01", categoryNames: cats }), {
  description: "ROCCO'S NO FRILLS", // bleed-through gibberish after the store number cut off
  amount: 25.01,
  currency: "CAD", // the card line prints "CAD$ 25.01" outright
  date: "2026-04-15", // from the unambiguous footer, NOT the year-first card timestamp
  category: "Grocery",
  items: [],
});

// Fourth real fixture, a card terminal slip with no itemisation at all. Its
// trap is quiet rather than loud: it parsed fine on the first pass, but the
// date "Apr 17,2026" matched no numeric pattern, so the form silently
// prefilled with today instead of the purchase date — nothing looked broken.
const gateway = `- TRANSACTION RECORD
GATEWAY NEWSSTANDS #104
20 SHEPPARD AVENUE WEST
TORONTO ON
Purchase
Apr 17,2026
VISA
TID: *****664
Sequence: 001 434
Auth#: 09216N
17:46:40
*****4945
Entry: Tap EMV (H)
Response: 01-027
Batch: 001
Amount
Total
$ 29.00
$ 29.00
A0000000031010 Visa Credit
Approved
Cardholder copy`;

assert.deepEqual(parseReceiptText(gateway, { today: "2000-01-01", categoryNames: cats }), {
  description: "GATEWAY NEWSSTANDS",
  amount: 29,
  currency: "",
  date: "2026-04-17", // month name, not today
  category: "",
  items: [],
});

// Sixth real fixture, LCBO. The store name sits two lines above the address
// with the branch number between them, and the same item prints its price in
// a different position the second time round — which is why findItems stays
// empty rather than pairing by position.
const lcbo = `LCBO
0658 AURORA STORE
94 FIRST COMMERCE DRIVE
(905)751-0684
IF YOU DRINK, DON'T DRIVE
STORE MGR/DIR. DE SUCC MRS SELARIU
ST:0658 TRM: 0006A TRN 18913 SALE
ALBERTA PREMIUM CASK STRENGTH RYE (2021
00014089
00750ML DEP .20 ea.
68.80
85.95 PROMO 20.0% (17.15)
ALBERTA PREMIUM CASK STRENGTH RYE (2021
(1 @ 68.60)
00014089
00750ML DEP .20 ea.
85.95 PROMO 20.0% (17.15)
(1 @ 68.60)
68.80
Total
137.60
Deposit (DEP)
0.40`;

const lcboParsed = parseReceiptText(lcbo, { today: "2000-01-01", categoryNames: cats });
assert.equal(lcboParsed.amount, 137.6);
assert.equal(lcboParsed.description, "LCBO"); // not the "0658 AURORA STORE" branch line
assert.equal(lcboParsed.date, "2000-01-01"); // nothing dated in shot — falls back to today

// Fifth real fixture, a Shoppers gift-card activation slip. It has no "TOTAL"
// anywhere — the terminal labels the figure "Amount" — and its value column
// keeps the colon separator, so the amount reads ": $100.00".
const shoppers = `Gift Cards are Non-Refundable
SHOPPERS
DRUG MART
NEIL G PHARMACY LTD
199 WENTWORTH ST. W. JOSHAWA ON L13 6P4
L1J6P4
905-728-4621
Jun 20, 2024 5.55 PM
0983 1012 663911 100081 3
Account
Card Number
Trans Type
Amount
Auth #
TRANSACTION RECORD
: Gift Card
*****1861
ACTIVATE
: $100.00
000000
Reference #
Merchant ID
Terminal #
00983012
Date
24/06/20
Approved`;

const shoppersParsed = parseReceiptText(shoppers, { today: "2000-01-01", categoryNames: cats });
assert.equal(shoppersParsed.amount, 100);
assert.equal(shoppersParsed.date, "2024-06-20");

// Both month-name orders, and a real month name is required — "Marker 3 2026"
// must not read as March.
assert.equal(findDate(["17 Apr 2026"], "2000-01-01"), "2026-04-17");
assert.equal(findDate(["April 3, 2026"], "2000-01-01"), "2026-04-03");
assert.equal(findDate(["no date at all"], "2000-01-01"), "2000-01-01");

// A run shorter than the label column means the columns don't correspond —
// better to hand the whole receipt to Gemini than to pick the wrong figure.
assert.equal(parseReceiptText(["MART", "9 King St", "SUBTOTAL", "TAX", "TOTAL", "5.00"].join("\n"), { today: "2000-01-01" }), null);
// Positional match landing on something that isn't the largest in its run is
// alignment gone wrong (a total below its own subtotal is impossible), so it
// fails closed too.
assert.equal(parseReceiptText(["MART", "9 King St", "SUBTOTAL", "TOTAL", "10.00", "5.00"].join("\n"), { today: "2000-01-01" }), null);

// A plainer receipt where the amount IS on the label's own line still works.
const inline = ["QUICK MART", "123 Main St, Toronto", "2026-03-04", "TOTAL $12.30"].join("\n");
assert.equal(parseReceiptText(inline, { today: "2000-01-01" }).amount, 12.3);

// No recognisable total -> null, which is the signal to fall back to Gemini.
assert.equal(parseReceiptText("just some\nunrelated text", { today: "2000-01-01" }), null);
assert.equal(parseReceiptText("", { today: "2000-01-01" }), null);

console.log("receiptOcr.js: all checks passed");
