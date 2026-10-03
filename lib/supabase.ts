"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Browser-side Supabase client. The publishable key is safe here: it can only do what the
   signed-in user is allowed to, as enforced by the row level security rules in supabase/schema.sql. */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured. Check .env.local.");
    client = createClient(url, key);
  }
  return client;
}
