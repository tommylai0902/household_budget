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

// Tenth real fixture, a fuel purchase — the first anchored on a phone number
// rather than a street address, and the first where the merchant window holds
// CJK lines (the phone's own photo-editor UI, "編輯影像", got into the shot).
// The brand keyword has to beat the nearer but useless "ONTN".
const petro = `TRANSACTION RECORD
PETRO
WILLOW DALL
ONTN
人
編輯影像
(416) 496 2443
VOICE NO: 075735
DATE:
2023-06-21
TRANS #: 614216
++ PREAUTH RECEIPT ONLY **
FUEL
REGULAR
18/416 1.529
30.00
TOTAL
CAD
30.00
Pre-Auth
30.00
INTERAC
00/001 APPROVED - THANK YOU`;

const petroParsed = parseReceiptText(petro, { today: "2026-07-31", categoryNames: ["Transport", "Grocery"] });
assert.equal(petroParsed.amount, 30);
assert.equal(petroParsed.date, "2023-06-21");
assert.equal(petroParsed.description, "PETRO"); // brand keyword, not the adjacent "ONTN"
assert.equal(petroParsed.category, "Transport");

// Ninth real fixture, and the first with neither an address nor a phone
// number — so the merchant comes from the first-non-junk fallback rather than
// the address anchor. Its OCR is badly garbled ("Iten ictal $", a date reading
// "16/00/7") yet the real total still resolves, and the zero month is rejected
// rather than becoming a date.
const grandCrystal = `#31
Grand Crystal Restaurant
RECEIPT
16/00/7 Pck 00044
Date
11:21 bess
1 Steamed Dumpf nuc
1016
7:50
1 pepper Feet Ujor
12.60
0.25
0.00
Iten ictal $
31.10
VIP 10% Discaut
1.51
Food SST(3):
1.47
Total($):
31.06
Print Time
14:03. Tony M
Thank You Please Cone Again.`;

const grandCrystalParsed = parseReceiptText(grandCrystal, { today: "2026-07-31", categoryNames: cats });
assert.equal(grandCrystalParsed.amount, 31.06);
assert.equal(grandCrystalParsed.description, "Grand Crystal Restaurant"); // no anchor; "#31" is junk
assert.equal(grandCrystalParsed.date, "2026-07-31"); // "16/00/7" is not a date, not month zero

// Eighth real fixture. Its date, "29/11/09", is the same shape as No Frills'
// "26/04/15" and means the opposite thing — day-first, not year-first. It
// resolves only because this receipt prints no unambiguous date anywhere and
// the year-first reading (2029) would be in the future.
const goldstone = `Goldstone Bakery & Restaurant
金石餐廳餅店
#110-139 Keefer Street
GST#102142007RT
Date: 29/11/09 17:49
Check# 44395
1
Baked Ox Tongue Spag
6.50
1 Coffee HK Sty
港式咖啡
0.00
SubTotal($):
6.50
GST($):
0.33
Total($)
6.83`;

const goldstoneParsed = parseReceiptText(goldstone, { today: "2026-07-31", categoryNames: cats });
assert.equal(goldstoneParsed.amount, 6.83);
assert.equal(goldstoneParsed.date, "2009-11-29"); // day-first; year-first would be a 2029 receipt
assert.equal(goldstoneParsed.description, "Goldstone Bakery & Restaurant");

// The ambiguous pass must not fire when an unambiguous date exists — No Frills
// still reads its footer, not its year-first card timestamp.
assert.equal(findDate(["26/04/15 18:41:08", "2026/04/15"], "2026-07-31"), "2026-04-15");
// Day-first landing in the future gives way to the year-first reading.
assert.equal(findDate(["20/05/28"], "2026-07-31"), "2020-05-28");
// Both readings in the future means no usable date — the caller's `today`
// stands rather than a guess.
assert.equal(findDate(["28/06/30"], "2026-07-31"), "2026-07-31");

// Seventh real fixture, a Vietnamese restaurant bill — the case that proves
// the largest-in-run guard earns its keep. Its "Amount" column header is a
// total label by the rules above, and the first amounts after it are 0.01 and
// 0.50; without that guard the bill would come back as one cent. It also has
// to prefer "Total" (19.69, what was actually paid) over "Total Sales" (18.09,
// before the service charge), which the last-one-wins rule handles.
const leViet = `#2
Le Viet Asian Cuisine
1210 Castlenore Ave., $4
Markham, ON L6E OH7
Phone: (905)201-6111
Server:
Oty Item
Amount
1 Tomato Crab paste ver w/Soup 15.50
LS13. 蕃茄的小菜
1 Take out box $0.50
外賣盒$0.50
Subtotal
0.01
0.50
16.01
HST
2.08
Total Sales
18.09
Server Tips (10%)
1.60
Total
19.69
Suppested Tips: 12% (2.17)
15% (2.71)
18% (3.26)
堂食10%服務費已加入賬單內`;

const leVietParsed = parseReceiptText(leViet, { today: "2000-01-01", categoryNames: cats });
assert.equal(leVietParsed.amount, 19.69); // not 0.01, and not the pre-tip 18.09
assert.equal(leVietParsed.description, "Le Viet Asian Cuisine");

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

// Eleventh real fixture, a gas station. Its trap: "TAX (13.00%)" prints the
// tax RATE inline, and that number used to be mistaken for the tax amount —
// stopping the backward label-scan one line early, so SUBTOTAL/TAX/TOTAL never
// grouped into the 3-label run that matches the $176.83/$22.99/$199.82 column
// below. The merchant works on the first try: the street-address line
// ("5740 YONGE STREET") anchors before the phone-number line does, since
// findMerchant scans in order and takes the first match.
const fuelmax = `FUELMAX STATION
5740 YONGE STREET
NORTH YORK ON M2M 3T3
(416) 222-4455
DATE
2024/04/26
23:47:19
RECEIPT #
8551929
PUNT N
07
FUEL TYPER
V-POWER
PRICE/GAL:
32 249
78.674
GALLONS:
SUBTOTAL:
TAX (13.00%)
TOTAL:
$176.83
$22.99
$199.82
PAYMENT METHOD
DEBIT CARD
CARD TYPE
INTERAL CHEQUING
CARD
AUTH W
350004
TRANSACTION 10-
APPROVED
AID
TERMINAL
THANK YOU
21645 8551929 070426 234719`;

const fuelmaxParsed = parseReceiptText(fuelmax, { today: "2000-01-01", categoryNames: cats });
assert.equal(fuelmaxParsed.amount, 199.82); // not 176.83 (subtotal) or 22.99 (the rate's own line)
assert.equal(fuelmaxParsed.description, "FUELMAX STATION");
assert.equal(fuelmaxParsed.date, "2024-04-26");
assert.equal(fuelmaxParsed.category, "Transport"); // "fuel" keyword — see csv.js

// Twelfth real fixture, a voided-and-corrected gas transaction. Its "TOTAL" is
// really a column header ("PRODUCT / TOTAL / QTY PRICE / AMOUNT") sitting
// over the voided line item, not a total label — so it resolves to the
// voided item's own $2.39 instead of the $5.40 actually charged in the
// correction line below. Nothing about a void/correction follows the normal
// label-then-amount-column shape, so this must fail closed to Gemini rather
// than guess.
const canadianTireGas = `四 編輯影像
TRANSACTION RECORD
Canadian Tire Gas
#1337
5067 Dixie Rd.
Mississauga Ontario
L4W 5S6
905-238-2771
2021-01-23 15:22:05 TRANS #: 143549
HST: R100773019
Paypoint: 01K
VOID OF TRANSACTION 143546
PRODUCT
CDry Dt Cran 500-1
CDry Dt Cran 500m
TOTAL
QTY PRICE
AMOUNT
2.39
39
2.39
HST 13.000 % -0.62
$5
5.40
PURCHASE CORRECTION S 5.40
Indated July 2026 - 20 Photos - 5067 Di`;

assert.equal(parseReceiptText(canadianTireGas, { today: "2000-01-01", categoryNames: cats }), null);

// Thirteenth real fixture, Real Canadian Superstore. Its trap: the GST line
// prints "36.98 € 5.000% 1.85" where "€" is Vision misreading "@" (the same
// receipt prints a real "@" twice elsewhere, "24.99 @" and "1 @ $24.99 ea") —
// without the fix this reads as a euro receipt. Also documents a known,
// accepted gap: the store name splits across two lines ("REAL CANADIAN" /
// "SUPERSTORE"), and only the second matches the Grocery keyword, so the
// merchant resolves to "SUPERSTORE" alone rather than the full name — fine to
// leave as-is, since merging window lines ahead of a keyword match would
// wrongly pull in T&T's "DELIVERY" noise line in that fixture instead.
const rcss = `REAL CANADIAN
SUPERSTORE
RCSS 1561 WILLOWBROOK DRIVE
604-532-5427
Big on Fresh, Low on Price
Welcome #
21-GROCERY
06038367175 TAGLIATELLE NEST MRJ
5. 29
06563318588 FIBER OATS CHO GMRJ 11.99
1
06810004413 KFT SIG RASP VIN
MRJ
3.79
22-DAIRY
06870010365 DAIR WHIP CREAM RO
27-PRODUCE
6.19
06038399155 PCO FLD GANS SLD MRJ
5.99
31-MEATS
2852620 PC FREE CHK DRUM
MR.J
11.68
35-DELI
05944100641 T STL BOCCONCINI
MAJ
06038318463 PC SPLENDIDO PAR
MRJ
8.49
11.00
07981300011 BOURSIN GARLIC
MAJ
6.99
OZ BABY
03700062819 PMPR DIPR NNJ S7
GPMAJ
$24.99 1 t 4. $29.99 ea
1 @ $24.99 ea
SUBTOTAL
24.99
96. 40
G=GST 5X
36.98 €
5.000%
1.85
P-PST 7X
24.99 @
7.000
1.75
TOTAL
100.00`;

const rcssParsed = parseReceiptText(rcss, { today: "2000-01-01", categoryNames: cats });
assert.equal(rcssParsed.amount, 100);
assert.equal(rcssParsed.currency, ""); // not EUR — "€" is a misread "@", see above
assert.equal(rcssParsed.category, "Grocery");

console.log("receiptOcr.js: all checks passed");
