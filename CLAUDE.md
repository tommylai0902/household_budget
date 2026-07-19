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

## Roadmap
- Step 3: monthly budgets + remaining-balance dashboard (`budgets` table already exists).
- Step 4: receipt scanning into the detail panel (Supabase Storage + a vision model).
