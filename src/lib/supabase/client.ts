import { createBrowserClient } from "@supabase/ssr";

// Supabase client for Client Components (camera, upload queue, gallery).
// Uses the publishable key: everything it can do is limited by RLS.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
