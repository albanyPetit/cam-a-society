import { createClient } from "@supabase/supabase-js";

export type PublicEvent = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  reveal_at: string;
  max_shots: number;
  date_stamp: boolean;
};

// Must match the `events.slug` check constraint in the initial migration.
const SLUG_PATTERN = /^[a-z0-9]{10,32}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

// Looks up an event by the slug in its QR link. Runs on the server without a
// user session: `get_event_by_slug` is the only way to read an event before
// joining, and it returns just the public fields.
export async function getEventBySlug(
  slug: string,
): Promise<PublicEvent | null> {
  if (!isValidSlug(slug)) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase
    .rpc("get_event_by_slug", { p_slug: slug })
    .maybeSingle<PublicEvent>();

  if (error) throw error;
  return data;
}
