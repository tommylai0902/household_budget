import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill them in."
  );
}

// The anon key is safe to ship in the browser — Row Level Security is what
// actually protects the data. Never put the service_role key in client code.
// ponytail: placeholder creds so the app renders before .env.local is filled in
export const supabase = createClient(url || "http://localhost:54321", anonKey || "placeholder-anon-key");
