# Step 2 — Run the shared ledger with Claude Code

You and Wing both sign in and see one dataset that updates in real time. Instead of
setting up the project by hand, you'll let Claude Code scaffold and run it. ~15 min.

The app files don't change — only the way you run them. The files you need:
`BudgetApp.jsx`, `main.jsx`, `supabase.js`, `db.js`, `supabase-schema.sql`,
`.env.example`, and `CLAUDE.md`. (You can ignore the earlier Step 1 files
`budget-app.jsx` and `schema.sql` now.)

---

## Part A — Get Claude Code

Pick one:

- **Desktop app (no terminal):** download Claude Code for macOS / Windows / Linux and
  sign in. Good if you'd rather not touch a command line.
- **Terminal — native install (recommended by Anthropic, auto-updates):**
  - macOS / Linux / WSL: `curl -fsSL claude.ai/install.sh | bash`
  - Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
- **Terminal — npm:** `npm install -g @anthropic-ai/claude-code` (needs Node.js; recent
  versions want Node 22+, older prints a warning but still works).

On first launch it opens your browser to sign in with your Anthropic account.

## Part B — Let Claude Code build and run the app

1. Make an empty folder, e.g. `household-budget`.
2. Inside it, make a subfolder `incoming/` and drop the seven files above into it.
   Put `CLAUDE.md` in the **project root** (not in `incoming/`).
3. Open Claude Code in that folder:
   - Desktop app: open the folder as your project.
   - Terminal: `cd household-budget` then `claude`.
4. Paste this prompt:

```
I'm building a Vite + React (JavaScript) household budget app. The source files are
in ./incoming/. Please set up and run the project in this folder:

1. Scaffold a Vite React (JavaScript) app in the current directory.
2. Install dependencies, then also: npm install @supabase/supabase-js lucide-react
3. Move files into place:
   incoming/BudgetApp.jsx  -> src/BudgetApp.jsx
   incoming/main.jsx       -> src/main.jsx
   incoming/supabase.js    -> src/lib/supabase.js
   incoming/db.js          -> src/lib/db.js
   incoming/supabase-schema.sql -> ./supabase-schema.sql   (leave at root for reference)
4. Replace src/index.css with just:  html, body, #root { margin: 0; height: 100%; }
5. Create .env.local with empty placeholders:
   VITE_SUPABASE_URL=
   VITE_SUPABASE_ANON_KEY=
6. Start the dev server and tell me the local URL.
```

Claude Code will do all of it and hand you a `localhost` link. It'll warn in the
console that the Supabase vars are empty — that's expected until Part C.

## Part C — Supabase (the one manual part)

Claude Code can't create your Supabase account for you, so do this in the browser:

1. **Create the project** at supabase.com → New project.
2. **Copy keys:** Project Settings → API → copy the **Project URL** and the
   **anon public** key. Paste them into `.env.local` (or ask Claude Code to write them
   in for you), then restart the dev server.
3. **Create the tables:** SQL Editor → New query → paste all of `supabase-schema.sql`
   → Run. (If the last line says "already a member of publication", ignore it.)
4. **Create the two accounts:** Authentication → Users → Add user → Create new user.
   Do it twice — one email for you, one for Wing.
5. **Allowlist both:** copy each user's UID from the Users list, then in the SQL Editor:
   ```sql
   insert into members (user_id, label) values
     ('PASTE-YOUR-UID',  'tommy'),
     ('PASTE-WINGS-UID', 'wing');
   ```

Now sign in. Add an expense, then open the app in a second browser (or have Wing sign
in on his phone) — entries appear on both within a second. Default categories seed
themselves on first load.

---

## Notes
- **Anon key in the browser is safe.** Row Level Security + the `members` allowlist are
  the real gate. Never put the `service_role` key in the app.
- **`paid_by` is `'tommy'`/`'wing'`**, separate from who's logged in — either of you can
  log a bill the other paid, just like the spreadsheet.
- **`CLAUDE.md`** at the project root tells Claude Code the stack and conventions, so
  future changes ("add a budgets dashboard") land in the right files.
- **Deploy later:** ask Claude Code to run `npm run build` and deploy to Vercel; add the
  two `VITE_` vars in the Vercel dashboard.

## Next
- Step 3 — monthly budgets + remaining-balance dashboard (schema already supports it).
- Step 4 — receipt scanning into the detail panel's "Receipt items" slot.
