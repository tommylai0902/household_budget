# Household Budget — project guide for Claude Code

A two-person household expense ledger (Tommy & Wing). Replaces a shared Google
Sheet. Dual-language UI (English / 繁體中文), split-bill settlement, live sync.

## Stack
- Vite + React 18 — plain JavaScript, not TypeScript
- Supabase (`@supabase/supabase-js`) — Auth, Postgres, Realtime
- Icons: `lucide-react`
- No CSS framework: inline styles + a tiny `index.css` reset

## Structure
- `src/main.jsx`        — entry point, renders `<App/>`
- `src/BudgetApp.jsx`   — `App` (auth gate) + `Login` + `Ledger` + all UI
- `src/lib/supabase.js` — Supabase client (reads `VITE_` env vars)
- `src/lib/db.js`       — data layer: row⇄app mappers, CRUD, realtime subscription
- `supabase-schema.sql` — run once in the Supabase SQL editor (tables + RLS)
- `.env.local`          — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (never commit)

## Commands
- Dev server: `npm run dev`
- Build:      `npm run build`
- Add a dep:  `npm install <pkg>`

## Conventions
- Postgres is snake_case; the UI is camelCase. All mapping lives in `db.js` — keep it there.
- `paid_by` is the text `'tommy'` | `'wing'`, independent of which account is logged in.
- `split` is `'personal'` | `'shared'` in the app; stored as `'personal'` | `'shared_50'`.
- Only the **anon** key goes in client code. Never the `service_role` key.

## Where things stand
Both of the old roadmap steps (budgets dashboard, receipt scanning) shipped, as
did inventory, the grocery list, flyer price matching and reminders. **See
[ARCHITECTURE.md](ARCHITECTURE.md)** for how it all fits, the schema, the API
routes, and the current open items.

Two things that file will save you from:
- `migrations/*.sql` are applied **by hand** in the Supabase SQL editor, and
  nothing records which have run — probe the live schema before assuming.
- Adding a user-visible string means adding it to **all five** language
  dictionaries in `BudgetApp.jsx`.
