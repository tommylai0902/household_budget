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

// A plainer receipt where the amount IS on the label's own line still works.
const inline = ["QUICK MART", "123 Main St, Toronto", "2026-03-04", "TOTAL $12.30"].join("\n");
assert.equal(parseReceiptText(inline, { today: "2000-01-01" }).amount, 12.3);

// No recognisable total -> null, which is the signal to fall back to Gemini.
assert.equal(parseReceiptText("just some\nunrelated text", { today: "2000-01-01" }), null);
assert.equal(parseReceiptText("", { today: "2000-01-01" }), null);

console.log("receiptOcr.js: all checks passed");
