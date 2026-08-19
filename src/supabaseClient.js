import { createClient } from "@supabase/supabase-js";

// Vite only exposes env vars to the browser if they're prefixed VITE_ —
// set these in Vercel: Project → Settings → Environment Variables.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly at build/boot rather than silently making requests to "undefined".
  console.error(
    "Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
    "in your .env.local (dev) or Vercel project settings (production)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
