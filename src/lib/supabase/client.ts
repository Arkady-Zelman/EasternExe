"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

/**
 * Browser-side Supabase client (anon key). Singleton per page load.
 * Safe to import from client components.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local"
    );
  }

  browserClient = createClient(url, anon, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return browserClient;
}
