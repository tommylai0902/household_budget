# Monira — architecture

Two-person household app (Tommy & Wing): expense ledger, inventory, grocery
list with flyer price-matching, and reminders. React SPA + Supabase + a handful
of Vercel functions. Installed as a PWA on iPhone, which drives several
decisions below.

`CLAUDE.md` is the short project guide loaded into every session. This file is
the longer version: how the parts fit, and the things that are not guessable
from reading one file.

---

## Stack & commands

| | |
|---|---|
| Build | Vite 5 + `@vitejs/plugin-react`, plain JS (no TypeScript) |
| UI | React 18, inline styles + `src/index.css`. **No CSS framework** |
| Icons | `lucide-react` |
| Backend | Supabase — Auth, Postgres, Realtime, RLS |
| Serverless | Vercel functions in `api/`, incl. 2 crons |
| AI | Gemini (`@google/genai`) for receipt/product/statement scanning |
| Push | `web-push` + a hand-written service worker |

```bash
npm run dev
```
```bash
npm run build
```

Tests are plain Node scripts with `node:assert` — no framework, no runner, not
wired into `package.json`. Run one directly:

```bash
node src/lib/settle.test.js
```

Covered: `settle.js`, `csv.js`, `categorize.js`, `recurring.js`,
`receiptOcr.js`, `zhGroceryTerms.js`, and `api/refresh-flyers.js`'s
`isRefreshDue` guard. The UI and `db.js` have no tests.

---

## Shape

```
src/
  main.jsx          31    entry
  BudgetApp.jsx   7906    App (auth gate) + Login + Ledger + EVERY panel & i18n
  sw.js             55    service worker: precache + push handlers
  index.css              reset + a few keyframes/media queries
  assets/
    kid-pig.svg           licensed vector art, see Kid Ledger below
  lib/
    supabase.js     16    client (VITE_ env vars)
    db.js         1237    ALL data access: row⇄app mappers, CRUD, realtime, syncs
    settle.js       60    split-bill netting        (+ .test.js)
    csv.js         107    statement/CSV parsing     (+ .test.js)
    categorize.js   16    keyword category guesser  (+ .test.js)
    recurring.js    28    recurrence date math      (+ .test.js)
api/                     7 Vercel functions (below)
migrations/              001–041, applied BY HAND (below)
```

`BudgetApp.jsx` is one 7,900-line file on purpose — every component, every
style object, and all five language dictionaries. It is not an accident and it
has not been "meaning to be split". Find things by `grep`, not by directory.

**The one hard rule:** Postgres is `snake_case`, the app is `camelCase`, and
*all* mapping lives in `db.js`. No component touches a raw row.

**Every full-screen view renders its own background.** Sign-in, the ledger
picker, the ledger view, and any popup that floats over page content each call
`theme === "dark" ? <CosmicBackground/> : <DaylightBackground/>` (both defined
in `BudgetApp.jsx`) themselves — there is no shared layout wrapper supplying
it. A new full-screen view means adding that line yourself, or it renders on a
flat background while everything around it has a starfield/daylight wash.

---

## Languages

Five: `en`, `zh` (繁中/Cantonese), `zh-Hans` (简中), `fr`, `es`. Each is a flat
object of the same keys near the top of `BudgetApp.jsx`. Adding a user-visible
string means adding it **five times**. Language is a per-device setting
(localStorage), *not* a column on the user — which matters for push (below).

---

## Database

Ledger-scoped tables all follow the same RLS shape from migration 009:
`has_ledger_role(ledger_id, 'VIEWER'|'EDITOR')`.

| Concern | Tables |
|---|---|
| Core | `ledgers`, `expenses`, `categories`, `budgets`, `merchants` |
| Split bills | `ledger_members` (participant *names*, not auth users), `expense_splits` |
| Access | `ledger_role` (user↔ledger↔role), `ledgers.owner_id`, `ledger_invite`, `members` (global allowlist) |
| Recurring | `recurring_rules` |
| Reminders | `notifications` (ledger-scoped, or household-wide when `ledger_id` is null — see below) |
| Inventory/grocery/stores | `inventory_items`, `grocery_list`, `inventory_labels`, `store_policies` — household-wide, not ledger-scoped (migration 038) |
| Household | `household_settings` — singleton row (`id = 1`), currently just the shared postal code |
| Kid Ledger | `wishlist_goals` (one row per kid ledger), `expenses.kind` (`'spend'` \| `'earn'`) |
| Push | `push_subscriptions` |

Two easily-confused things:
- **`ledger_members`** = who splits the bill (display names). **`ledger_role`** =
  who can log in and see the ledger. They are unrelated.
- Ledger recipients = `ledgers.owner_id` **∪** `ledger_role.user_id`. The owner
  does not necessarily have a `ledger_role` row.

**Inventory, grocery, and store setup are household-wide, not per-ledger**
(migration 038). They used to carry a `ledger_id` like every other table, but
the Home page always presented "Ledger & Transactions" / "Inventory Hub" /
"Smart Grocery" as three peer cards — switching the ledger switcher was
silently emptying the other two, since their data was never actually shared,
just coincidentally populated under whatever ledger you'd last added items
from. RLS on these four tables now runs on `is_household_member()` (membership
in `members`, the original login allowlist — unused for row security since
migration 009, repurposed here) instead of `has_ledger_role()`. There is no
VIEWER/EDITOR split on them: presence in `members` grants full read/write,
matching how these features already behaved. `household_settings` exists
because `GroceryListPanel`/`StoreSetupPanel`/`PriceMatchModePanel` all used to
key off `ledgers.postal_code`, which no longer has a home once these aren't
tied to one ledger. `notifications.ledger_id` is nullable for the same reason
— only the inventory-expiry producer writes a null row; per-expense and
upcoming-charge reminders stay ledger-scoped, since expenses genuinely are
per-ledger.

Two smaller additions since: `ledgers.archived` (migration 041) hides a ledger
from every list — picker, switcher, notification routing, the nightly
reminder cron — without deleting its data; only the owner can flip it (same
RLS as rename/delete), and it's restored from Settings → Archived ledgers.
`ledgers.start_date`/`end_date` (migration 040) let a travel ledger run on a
fixed trip period instead of the monthly cycle every other template uses —
nullable and opt-in, and when both are set the app stops month-scoping that
ledger anywhere (transaction list, budget, Report, Settlement, Home banner);
see `isPeriodLedger` in `BudgetApp.jsx`. `flyer_items.item_id` /
`grocery_list.deal_item_id` (migration 039) let a saved deal deep-link to that
item's exact position in the Flipp flyer instead of always landing on its
front page.

### Migrations are applied by hand

There is no migration runner. `migrations/NNN-*.sql` are pasted into the
**Supabase SQL editor** manually. Nothing in the repo records what has been
applied.

**Do not assume a migration has run — probe the live schema first.** This has
bitten twice: once assuming an applied migration was pending, once shipping a
sync against a column that existed but an index that was subtly wrong.

```bash
# does column X exist? 200 = yes, 400 = no
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$SUPABASE_URL/rest/v1/notifications?select=pushed_at&limit=1"
```

DDL cannot be run over PostgREST (no `exec_sql` RPC), so a schema change
*always* means asking the user to run SQL. Write migrations idempotently
(`if not exists`, `drop ... if exists` first) so re-running repairs a
half-applied database.

---

## API routes (`api/`)

| Route | Auth | Notes |
|---|---|---|
| `rbac.js` | caller's token | Invites/roles, routed by `?action=`. Runs **as the caller** so RLS is the authority; service role only to read an invite by token. |
| `scan-receipt.js` | caller's token + `members` | Cloud Vision OCR + regex first, Gemini only if that isn't confident — see below |
| `scan-product.js` | caller's token + `members` | Gemini → product name/brand/unit. Reads the **label, not the barcode** (Safari has no `BarcodeDetector`) |
| `scan-statement.js` | caller's token + `members` | Gemini → many transactions, for batch import |
| `scan-deals.js` | none (public read) | Searches the `flyer_items` mirror **only** — never calls Flipp live |
| `refresh-flyers.js` | `CRON_SECRET` | **Cron, Thu + Sat 08:00 UTC.** Mirrors whole flyers for the household postal code |
| `send-reminders.js` | `CRON_SECRET` | **Cron, daily 13:00 UTC.** Generates expiry rows + sends push |

`vite.config.js` mounts these under `vite dev` with a tiny `res.status().json()`
shim, so `/api/*` works locally without `vercel dev`. **A route added to `api/`
must also be added to that list**, or it 404s in dev only.

---

## Non-obvious pipelines

### 1. Flyer prices (price matching)

Flipp is called **only** by the cron (Thursday and Saturday — see below),
which copies whole flyers for the household's saved postal code
(`household_settings`, migration 038) into `flyer_items`. User searches hit
that table. So no amount of tapping "Price Match Check" can rate-limit the
IP, and a product nobody ever searched still answers instantly.

**The whole feature is only as fresh as that weekly run, and it fails silently
when it doesn't happen.** An unrefreshed mirror doesn't error — every grocery
flyer in it simply passes its `valid_to`, `scan-deals.js` filters them all out,
and the app reports "no deals" for products that are visibly on sale in store.
Two separate bugs caused exactly that on 2026-08-09 (mirror 8 days stale, every
item expired 08-05):
- `refresh-flyers.js` was still reading `ledgers.postal_code` after migration
  038 moved it to `household_settings`. It kept working *only* on the value
  left behind in the old column, and would have gone permanently silent
  ("skipped: no postal code set") the moment anyone set a new postal code in
  the app.
- The re-run guard was a flat "skip if refreshed < 6 days ago". A one-off
  manual refresh on a Saturday made the real Thursday run 5 days later, so it
  skipped, pushing the next attempt out a further week. **A plain age
  threshold cannot work here** — Vercel Hobby fires crons roughly daily
  regardless of the expression, so any threshold low enough to let a slightly
  early Thursday through also lets the daily re-fire through. The guard now
  gates on the day (`isRefreshDue`, exported and unit-tested in
  `api/refresh-flyers.test.js`), with a 20-hour floor against same-day
  double-fires and an 8-day ceiling so a missed run self-heals instead of
  waiting a whole extra cycle.

**It runs Thursday *and* Saturday, and one run a week cannot replace that.**
Flipp exposes `available_from` separately from `valid_from`, and the two are
not a fixed offset. Measured over one region's 148 flyers: 65 go up a day
early, 65 go up the same day they take effect, a handful 2+ days early. The
big chains (Food Basics, No Frills, Loblaws, Metro, Sobeys, Superstore,
FreshCo, Fortinos) publish Wednesday for a Thursday start, so Thursday
catches them — as it does Shoppers (up 2 days early) and Walmart/Btrust/
Nations (1 day early).

The same-day group is the problem, and it is mostly Friday-start Asian
supermarkets — T&T, Oceans, Blue Sky, Bestco, Fresh Land, Tone Tai, Food
Depot, Lady York. Their flyers run Fri→Thu and only become available on the
Friday, so a Thursday-only mirror met them on the single day they were
expiring and never once carried them while they were current. They were
effectively absent from price matching altogether. Saturday catches that
group with five days of validity left.

When adding a merchant to a search and getting nothing, check
`available_from` on the Flipp flyer list before assuming the product simply
isn't on sale:

```bash
curl -s "https://backflipp.wishabi.com/flipp/flyers?locale=en-ca&postal_code=M5A0E7"
```

When "no deals" looks wrong, check `max(fetched_at)` for the region before
anything else.

**An empty result has three causes and only one of them is about shopping.**
`scan-deals.js` separates them before answering, because a data-collection
failure reported as "no deals" tells the user a product isn't on sale when
nobody actually looked:

| Response | Meaning | UI |
|---|---|---|
| `pending: true` | no rows for the region at all — never mirrored | `dealsPending` |
| `stale: true` + `lastRun` | rows exist, but **none are still valid** | `dealsStale`, naming the date |
| neither, `deals: []` | mirror is current, nothing matched | `dealsNoneFound` |

The stale check is exact rather than an age threshold: while the cron keeps
up, the region always carries some live flyer, so *zero* live rows means a run
was missed, full stop. `dealsMirrorMessage()` in `BudgetApp.jsx` is the one
place that maps this to a string — all three call sites go through it.

Price Match Mode is the one that mattered most: it never checked `pending` at
all, so a stale mirror rendered as every item cleanly reporting "no deals",
the most misleading thing that panel can say. It now refuses to show a report
at all when the mirror is unusable, since every row in it would be built from
the same dead data. `nearby_merchants()` returns two
booleans derived from Flipp's own flyer categories, `is_grocery` (032) and
`is_home_garden` (037 — Flipp has no dedicated "hardware" category, so this is
the closest bucket: Home Hardware/RONA/Home Depot/Canadian Tire, alongside
furniture shops sharing it), so Store Setup can filter Supermarkets / Hardware
& home / All Stores instead of always showing the ~109-merchant region list.

`api/scan-deals.js` matches `q` and an optional `brand` as two `ilike`
substrings against `flyer_items.name`, AND'd together. Flipp often folds
several products into one combo "OR" flyer line ("REAL DAIRY OR DRUMSTICK ICE
CREAM") without spelling out the manufacturer, so a brand-filtered search can
come back empty even though the product is right there — the route retries
once without the brand filter whenever that happens, rather than reporting a
false "no deals".

**Flipp has no canonical product spelling, and substring matching is
unforgiving about it.** One region held `GLAD CLING WRAP` (Food Basics),
`GLAD CLINGWRAP` (No Frills) and `GLAD PLASTIC WRAP` (Fortinos) within two
weeks — three spellings of one product, and a search for any one of them finds
at most two. So a value in `zhGroceryTerms.js` may be a **list** of
alternatives; `scan-deals.js` searches every one and merges the results rather
than stopping at the first that hits, because different stores use different
spellings and stopping early hides exactly the cheaper store the feature
exists to surface. Results are deduped (one combo line can match two
spellings) and re-sorted by price after merging.

Keep each alternative a **whole word**. The shorter "cling" covers both wrap
spellings in a single term, which is tempting and wrong: it is also a
substring of "re**cycling**", and pulled Wayfair recycling bins into a search
for cling wrap. `zhGroceryTerms.test.js` pins both halves of this — real flyer
lines that must match, and the recycling bin that must not.

**Store setup (`store_policies`, migration 036) is one local store plus that
store's price-match list, not a flat "my stores" set.** Exactly one row per
ledger has `is_local = true` (a partial unique index enforces this — see
`setLocalStore` in `db.js`, which clears any other local row before setting a
new one). Every *other* row's tri-state `price_matches` column is repurposed:
it no longer means "does this store price match" in general, it means "is
this store on my local store's price-match list" — true/false/null, and null
("not asked") must stay distinct from false, same rationale as always. This
matters because match policies aren't symmetric or universal: Real Canadian
Superstore won't match Walmart's flyer just because both sell milk.

**Price Match Mode has nothing left to pick.** With one local store, it skips
the old "which store are you in" step and runs on open: for every pending
grocery item, it fetches deals filtered to `{price-match-list stores} ∪
{local store}`, so the local store's own current flyer is always in the
comparison too — if it already beats every price-match-list store, the item
shows as "already here" rather than suggesting a match that isn't actually
cheaper. Nothing outside that set (a merchant you never added to the list) can
surface, even if it's objectively cheaper — an unreachable "cheaper elsewhere"
isn't actionable at the till.

A saved deal on a `grocery_list` row (`target_supermarket`, `deal_price`,
`deal_valid_to`, …) is a point-in-time snapshot, never re-validated against
the flyer mirror after it's picked. `GroceryRow` compares `dealValidTo` to
today client-side and swaps the pill from green to amber past that date (a
missing `dealValidTo` is treated as still fresh, not expired). Completing an
item clears all eight deal fields (`toggleGroceryItem`, sharing the same
`CLEARED_DEAL` object `updateGroceryItem` uses on a rename) — a finished trip
has no more use for the cutout, and leaving it attached just accumulates
stale rows.

### 2. Reminders → the bell → your phone

`notifications` has **three producers**, all upserting on a unique FK:

| Producer | Key | Written by |
|---|---|---|
| Per-expense reminder | `expense_id` | `upsertReminderNotification` (user action) |
| Upcoming recurring charge | `recurring_rule_id` | `syncUpcomingChargeReminders` |
| Inventory expiry | `inventory_item_id` | `syncExpiryReminders` (client) **and** `api/send-reminders.js` (cron) |

Both sync functions run on **ledger load**, best-effort with a silent
`.catch(() => {})` — deliberate, because a VIEWER cannot insert and would
otherwise log on every load. That silence hides real failures: when a sync
"does nothing", instrument the catch first.

`cycle_date` = the underlying date a row was generated for (expiry date, or the
recurring occurrence). It exists so a user-edited `remind_at` survives until
the underlying date actually moves. `fetchNotifications` filters
`remind_at <= today`, so a row created late with a past date still appears —
which is why a cron that only *pre-creates* rows changes nothing visible.

`pushed_at` ≠ `read`: `read` means dismissed in the bell, `pushed_at` means the
phone was told. A reminder is marked pushed only if a send actually succeeded,
so a run where every subscription fails doesn't silently burn it. 404/410
subscriptions are deleted — they never come back.

**Push specifics.** The PWA uses `strategies: 'injectManifest'` with a
hand-written `src/sw.js`, because a generated worker can't handle `push` and a
second worker can't share the scope. `skipWaiting`/`clientsClaim` live in that
file (the `workbox` option is ignored in this mode). `devOptions.enabled` is on
so a service worker exists under `vite dev` — without it
`navigator.serviceWorker.ready` never resolves, and it never rejects either,
so it's wrapped in `swReady()` with a timeout.

Subscriptions are **per-device**, and carry their own `lang`, because language
is a per-device setting — Tommy's phone can be English while Wing's is 繁中 on
the same ledger. The bell title (shared by the ledger) uses the first
subscribed member's language; there is no single right answer there.

iOS only allows push for a PWA **installed to the home screen**, never a Safari
tab.

### 3. Receipt scanning: Vision+regex before Gemini

Gemini's free tier is a shared, small quota (`generate_content_free_tier_requests`,
seen erroring at `limit: 20`) — one request counts the same whether it's an
image or a sentence, so nothing short of not calling Gemini at all helps.
`scan-receipt.js` tries Cloud Vision's OCR (`api/vision.js`, `DOCUMENT_TEXT_DETECTION`)
first and parses the raw text with regex (`src/lib/receiptOcr.js`), which
resolves a well-formatted receipt without touching Gemini at all.
`parseReceiptText` returns `null` whenever it isn't sure, and *that's* the
fallback signal: the handler then runs the original Gemini image path
unchanged. `GOOGLE_VISION_CREDENTIALS_JSON` unset (or Vision itself failing)
is treated the same as "not confident" — `ocrText()` swallows the error and
returns `null` rather than throwing, so this is safe to leave unconfigured.

**The parser's shape is dictated by one fact: Vision does not preserve the
receipt's visual columns.** `TOTAL          $31.64` comes back as `TOTAL` then
`$31.64` on separate lines — and sometimes as a whole stacked column of labels
followed by the whole column of amounts, with a dozen unrelated lines wedged
between them. So the total is found by locating the label's index among the
money labels it's stacked with, then taking the amount at that index from the
next run of amounts at least as long as the label column. The picked figure
must be the largest in its run (a total is never below its own subtotal, and
this is what stops a bare column-header "Amount" from matching its own tiny
neighbour); failing either check returns `null` rather than a wrong number.
`TOTAL_LINE` also matches `Amount`/`Amounts`, because a card-terminal slip
often has no literal "TOTAL" at all.

Dates get the same treatment, in two passes (`findCertainDate` then
`findAmbiguousDate` in `receiptOcr.js`). The first pass only accepts shapes
with one legal reading: ISO, year-first, month names, and MM/DD slashes (the
North American assumption `csv.js` also makes) — and rejects month/day 0 or
>12/31, since garbled OCR yields zeroes as readily as overflow. The second
pass runs *only* when nothing certain was found anywhere on the receipt, for
the genuinely ambiguous shape `DD/MM/YY` vs `YY/MM/DD` (`29/11/09` and
`26/04/15` are the same shape and mean opposite things): it tries day-first,
then year-first, and takes whichever lands in the past — a receipt dated in
the future is the wrong reading. Both readings in the future means no usable
date, and `today` stands rather than a guess. This still has one honest gap:
a receipt whose *only* date is a past-dated year-first stamp with no
corroborating unambiguous date anywhere reads as day-first instead — outside
North America's actual convention. Hasn't shown up in a real receipt yet.

Merchant-name matching (`findMerchant`) anchors on whichever comes first, a
street address or a phone number, and searches the few lines above it for one
matching a known brand keyword (from `csv.js`'s `CATEGORY_KEYWORDS`) before
falling back to the closest line — so a branch label two lines down
("Fairview Mall Store" under "T&T Supermarket") or one line down with the
brand further up ("0658 AURORA STORE" under "LCBO", "ONTN" — a garbled
province code — under "PETRO") doesn't win just for being closer. A receipt
with neither anchor (no address, no phone — a small counter terminal) falls
back to the first non-junk line outright. A line opening with 3+ digits is
treated as a branch/store number and skipped either way.

`receiptOcr.test.js` is built from **ten real Vision outputs**, not synthetic
receipts — the first synthetic version passed its own tests and then failed on
the first real photo. Each fixture pins a distinct trap: T&T (loyalty ad above
the store name), Tahini's (stacked label/amount columns with stray text
between them), No Frills (ink bleeding through from the back read as
gibberish; a dozen card-transaction lines between the columns; year-first
`26/04/15`), Gateway (`Apr 17,2026` — silently fell back to *today* before
month names were handled), Shoppers (`Amount` label, `:`-prefixed value),
LCBO (branch-number line between store name and address; the *same item*
priced in two different positions — why `findItems` always returns `[]`), Le
Viet (an "Amount" *column header* immediately followed by unrelated small
figures — the largest-in-run guard earns its keep here), Goldstone
(day-first `29/11/09`, resolved by ruling out the future year-first reading),
Grand Crystal (no address or phone at all; a zero month, `16/00/7`), Petro-
Canada (phone-anchored, CJK noise in the merchant window from the phone's own
camera-app UI getting into frame).

**Line items are always empty on the Vision path** (`findItems` returns `[]`
by design). Three grocery receipts scramble name↔price order three different
ways, and LCBO prints the *same item*'s price in two different positions
within one receipt — so pairing by position is a guess, and a price attached
to the wrong item is worse than none. Instead, `ExpenseForm` offers "read the
individual items with AI" after a scan comes back without items: it re-posts
the same held photo with `wantItems: true`, which skips Vision server-side.
One metered call, explicitly chosen, once per photo.

Auth is a downloaded **service-account key**, not a plain API key — this
household's GCP org enforces `iam.disableServiceAccountKeyCreation`-adjacent
policies that block bare API keys outright (the error is literally titled
"服務帳戶金鑰建立功能已停用" when tried on the org-managed project); a
*separate*, non-org Google account's project was used instead, where key
creation is unrestricted. `GOOGLE_VISION_CREDENTIALS_JSON` holds that key
file's JSON as a single line; `api/vision.js` feeds it to `google-auth-library`
(`GoogleAuth` → `getClient()` → `getAccessToken()`) for a bearer token, cached
at module scope so a warm function instance doesn't re-sign a JWT per request.
PDFs skip
Vision entirely (its `images:annotate` doesn't read them) and go straight to
Gemini. `scan-product.js` and `scan-statement.js` are untouched — a photographed
product has no fixed-layout text to key regex off, and it wasn't worth
building for statements yet.

### 4. Kid Ledger

A fifth ledger template (`household`/`travel`/`personal`/`kid`/`blank`) that
replaces the whole grown-up UI with its own dashboard (`KidLedgerDashboard`)
rather than reusing the ledger transaction list with a different skin —
`BudgetApp.jsx` branches on `ledger.template === "kid"` right where the ledger
view mounts, before any of the normal Home/Ledger/Report chrome exists.

It rides the existing `expenses` table instead of a parallel one (migration
016): `kind` (`'spend'`|`'earn'`, default `'spend'`) is the only new column, so
it inherits every mapper, RLS policy, and realtime subscription already built
for expenses. Every other template only ever writes `'spend'` — Kid Ledger is
a pure addition, nothing already in the app changes behaviour. `wishlist_goals`
holds one savings target per kid ledger via `upsert`, not an append-only
history — setting a new goal overwrites the old one. It's also the one query
gated on `ledger.template === "kid"` client-side; every other template skips
it outright rather than fetching and ignoring it.

The dashboard is deliberately its own fixed, saturated palette
(`KID_PURPLE`/`KID_YELLOW`/`KID_GREEN`/…) and rounded font stack
(`"Quicksand", "Nunito", ui-rounded, "SF Pro Rounded", system-ui`) — it ignores
the user's `--accent`/dark-mode theme vars on purpose, so it reads as its own
gamified thing next to the grown-up ledgers rather than a tinted variant of
them. No webfont is actually loaded; Quicksand/Nunito only take effect if the
device happens to have them, and are named mainly in case this ever gets
self-hosted.

The vault mascot (`PiggyMascot`, rendering `src/assets/kid-pig.svg`) is
licensed vector art (VectorStock #47618104), dropped in as a bundled asset
rather than redrawn — swap the SVG file to change it, and clear the license
before shipping a build with a different image there.

---

## Environment

`.env.local` (gitignored, never committed):

| Var | Where |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client + server |
| `SUPABASE_SERVICE_ROLE` | **server only** — never `VITE_`-prefixed |
| `GEMINI_API_KEY` | server only |
| `GOOGLE_VISION_CREDENTIALS_JSON` | server only; optional — unset just means every receipt scan goes straight to Gemini |
| `VITE_VAPID_PUBLIC_KEY` | client (safe to ship) |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | server only |
| `CRON_SECRET` | Vercel only; gates both crons — **pending rotation, see State** |

Anything `VITE_`-prefixed is bundled into browser JS and readable by anyone.
Only the **anon** key belongs there.

---

## Gotchas that have actually bitten

- **Gemini free tier allows 5 requests**, shared across all three scan routes.
  The SDK retried 429s five times by default, so *one* scan tap burned the whole
  quota and still failed, after a ~27s hang. Retries are now off via
  `SCAN_REQUEST_OPTS` — which must be the **second argument** to
  `interactions.create`; the interactions bridge builds its own inner client and
  ignores `retry_config` passed to `new GoogleGenAI()`.
- **`ON CONFLICT` cannot infer a partial unique index** unless the statement
  repeats the predicate, which PostgREST's upsert never does. Keep unique
  indexes plain; NULLs don't collide anyway.
- `vite dev` caches transitively-imported API modules — **restart the dev server**
  after editing something like `api/gemini.js`, or you'll test stale code.
- `dev-dist/` is generated by the PWA plugin in dev and is gitignored.

`grep -rn "ponytail:"` finds 8 deliberate shortcuts, each naming its own ceiling
and upgrade path (PDF size caps, a read-then-write race, recurrence iteration
limit, etc.). They are decisions, not TODOs.

---

## State

**Working and verified:** ledger/expenses/budgets/splits/recurring, invites &
RBAC, inventory + labels, grocery list, flyer mirror + price match, store setup
(single local store + price-match list), Price Match Mode (auto-runs, no store
picker), receipt/statement/product scanning, scan-to-price-match from the
grocery page, expired-deal handling on grocery rows, deal fields cleared on
completion, expiry reminders in the bell, cron-side reminder generation,
notification dismiss (`dismissed` flag, not a hard delete — 035), **web push
end-to-end** (see below), household-wide inventory/grocery/store setup (038,
one shared list/store config instead of per-ledger), flyer deep links to a
saved deal's exact item (039), travel-period ledgers that skip month-scoping
(040), ledger archiving (041), Kid Ledger dashboard + wishlist goals (016,
restyled 2026-08 — see Non-obvious pipelines).

**Migrations 001–041 are all applied.** 038–041 confirmed live against the
production schema on 2026-08-09 (`household_settings` reachable,
`flyer_items.item_id`/`ledgers.start_date`/`ledgers.archived`/
`grocery_list.deal_item_id` all present, `inventory_items.ledger_id` correctly
gone — 400 on select).

**Cloud Vision receipt reading is confirmed working in production
(2026-07-31)**, verified by scanning real receipts on a phone and watching
`POST /api/scan-receipt` return 200 with no fallback logged. Ten different
receipts across restaurants, a bakery, a fuel station and retail were read
this way; two receipts along the way (Metro, and an early Shoppers attempt)
fell back to Gemini on purpose rather than guess. Note the Cloud project
needed **billing enabled** before the API would answer at all — it 403s with
`BILLING_DISABLED` until then, even though usage under ~1,000 calls/month is
free.

**Web push is now confirmed working on a real device (2026-07-31).** The
Vercel deploy was initially missing `VITE_VAPID_PUBLIC_KEY` — `PushToggle`'s
`pushSupported()` check fails silently (renders nothing, no error) when that's
unset, which is why the toggle didn't appear in Settings at all rather than
erroring. Fixed by adding `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT` and `CRON_SECRET` in Vercel's project settings and redeploying
— `VITE_`-prefixed vars are baked in at build time, so adding the env var
alone doesn't do anything until the next build. `CRON_SECRET` has no
canonical source; it's just a shared random string Vercel echoes back as the
`Authorization` header on its own scheduled invocations, generated fresh and
saved to both Vercel and `.env.local` so local and production match. Verified
by inserting a throwaway `notifications` row, POSTing `/api/send-reminders`
locally with that secret, confirming `sent: 1` and a real notification landing
on a home-screen-installed iPhone (`push_subscriptions.endpoint` is
`web.push.apple.com/…`, confirming Apple's push service specifically), then
deleting the test row.

**Unfinished:**
- **Rotate `CRON_SECRET` (precautionary, not an incident).** The current value
  ended up in plaintext in `.claude/settings.local.json`: Claude Code stores
  approved commands verbatim, and an approved `curl -H "Authorization: Bearer
  <secret>"` against `/api/refresh-flyers` was recorded whole. It was **never
  committed** — verified with `git log --all -S` across every branch — and that
  file is gitignored and untracked as of a056f69, so nothing leaked. Still worth
  replacing, since it now sits in a file any future agent session can read. To
  rotate: generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
  set it in Vercel's env vars *and* `.env.local` so local matches production,
  redeploy, confirm a cron route returns 200 with the new secret and 401
  without, then delete the stale token from the allowlist file. Nothing
  client-side reads it — only the two cron routes below.
- **Known quirk, unfixed:** from Inventory or Grocery, the view switcher's
  "Ledger & Transactions" calls `onExit()` and lands on the ledger *picker*,
  not the transactions view (`BudgetApp.jsx`, the `onSwitchView` props). Looks
  unintended given the label.
- **The "read the individual items with AI" button is untested end to end.**
  The route accepts `wantItems` and the button renders, but nobody has watched
  it come back with actual line items — Gemini's quota was exhausted for the
  whole session it was built in.
- **`SCAN_DEBUG_OCR` is local-only on purpose.** Set in `.env.local`, it logs
  the raw OCR of *successful* parses too, which is the only way to collect new
  fixtures once a receipt stops falling back. Never set it in Vercel: it writes
  whole receipts to the log verbatim.
- A receipt whose totals block is itself mangled by OCR (Metro came back with
  `56. 15` — a space inside the number — and a stray bare `15`) falls back to
  Gemini and stays that way. Loosening the amount pattern to catch it would
  mean guessing at money, so it wasn't done; re-shooting the receipt is the fix.
