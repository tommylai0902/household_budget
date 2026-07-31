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

Covered: `settle.js`, `csv.js`, `categorize.js`, `recurring.js`. The UI and
`db.js` have no tests.

---

## Shape

```
src/
  main.jsx          31    entry
  BudgetApp.jsx   6501    App (auth gate) + Login + Ledger + EVERY panel & i18n
  sw.js             55    service worker: precache + push handlers
  index.css              reset + a few keyframes/media queries
  lib/
    supabase.js     16    client (VITE_ env vars)
    db.js         1135    ALL data access: row⇄app mappers, CRUD, realtime, syncs
    settle.js       60    split-bill netting        (+ .test.js)
    csv.js         107    statement/CSV parsing     (+ .test.js)
    categorize.js   16    keyword category guesser  (+ .test.js)
    recurring.js    28    recurrence date math      (+ .test.js)
api/                     7 Vercel functions (below)
migrations/              001–034, applied BY HAND (below)
```

`BudgetApp.jsx` is one 6,500-line file on purpose — every component, every
style object, and all five language dictionaries. It is not an accident and it
has not been "meaning to be split". Find things by `grep`, not by directory.

**The one hard rule:** Postgres is `snake_case`, the app is `camelCase`, and
*all* mapping lives in `db.js`. No component touches a raw row.

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
| Reminders | `notifications` |
| Inventory/grocery | `inventory_items`, `grocery_list`, `inventory_labels` |
| Flyers | `flyer_items` (regional mirror), `deals_cache`, `store_policies` |
| Push | `push_subscriptions` |

Two easily-confused things:
- **`ledger_members`** = who splits the bill (display names). **`ledger_role`** =
  who can log in and see the ledger. They are unrelated.
- Ledger recipients = `ledgers.owner_id` **∪** `ledger_role.user_id`. The owner
  does not necessarily have a `ledger_role` row.

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
| `scan-receipt.js` | caller's token + `members` | Gemini → expense + line items |
| `scan-product.js` | caller's token + `members` | Gemini → product name/brand/unit. Reads the **label, not the barcode** (Safari has no `BarcodeDetector`) |
| `scan-statement.js` | caller's token + `members` | Gemini → many transactions, for batch import |
| `scan-deals.js` | none (public read) | Searches the `flyer_items` mirror **only** — never calls Flipp live |
| `refresh-flyers.js` | `CRON_SECRET` | **Cron, Thu 08:00 UTC.** Mirrors whole flyers per postal code |
| `send-reminders.js` | `CRON_SECRET` | **Cron, daily 13:00 UTC.** Generates expiry rows + sends push |

`vite.config.js` mounts these under `vite dev` with a tiny `res.status().json()`
shim, so `/api/*` works locally without `vercel dev`. **A route added to `api/`
must also be added to that list**, or it 404s in dev only.

---

## Two non-obvious pipelines

### 1. Flyer prices (price matching)

Flipp is called **only** by the Thursday cron, which copies whole flyers for
every postal code any ledger has saved into `flyer_items`. User searches hit
that table. So no amount of tapping "Price Match Check" can rate-limit the IP,
and a product nobody ever searched still answers instantly.

Consequence: a region with no mirror run yet returns `pending`, not "no
results" — the UI says so explicitly. `is_grocery` on `nearby_merchants()`
comes from Flipp's own flyer categories (032) so store setup can lead with
supermarkets rather than hardware shops.

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

---

## Environment

`.env.local` (gitignored, never committed):

| Var | Where |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client + server |
| `SUPABASE_SERVICE_ROLE` | **server only** — never `VITE_`-prefixed |
| `GEMINI_API_KEY` | server only |
| `VITE_VAPID_PUBLIC_KEY` | client (safe to ship) |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | server only |
| `CRON_SECRET` | Vercel only; gates both crons |

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

`grep -rn "ponytail:"` finds 7 deliberate shortcuts, each naming its own ceiling
and upgrade path (PDF size caps, a read-then-write race, recurrence iteration
limit, etc.). They are decisions, not TODOs.

---

## State

**Working and verified:** ledger/expenses/budgets/splits/recurring, invites &
RBAC, inventory + labels, grocery list, flyer mirror + price match, store setup,
Price Match Mode, receipt/statement/product scanning, scan-to-price-match from
the grocery page, expiry reminders in the bell, cron-side reminder generation.

**Migrations 001–034 are all applied** as of 2026-07-31.

**Unfinished / needs a real device:**
- **Web push last hop is untested.** Everything server-side is verified against
  the live database (generates rows unattended, idempotent, prunes dead
  endpoints, doesn't burn reminders on failure), but no notification has ever
  reached a real handset — the dev browser reports `Notification.permission:
  "denied"`. Requires: VAPID vars + `CRON_SECRET` added in **Vercel**, then
  home-screen install → Settings → "Notify me on this device".
- **Known quirk, unfixed:** from Inventory or Grocery, the view switcher's
  "Ledger & Transactions" calls `onExit()` and lands on the ledger *picker*,
  not the transactions view (`BudgetApp.jsx`, the `onSwitchView` props). Looks
  unintended given the label.
- `CLAUDE.md`'s Roadmap section is **stale** — it lists budgets and receipt
  scanning as upcoming; both shipped long ago.
