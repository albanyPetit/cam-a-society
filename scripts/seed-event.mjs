// Creates a test event and prints its join links.
//
//   npm run seed:event
//   npm run seed:event -- --name "Sunrise Yoga" --hours 3 --reveal-in 10
//
// --name        Event name (default: "Test event <time>")
// --hours       Duration from now (default: 3)
// --reveal-in   Minutes from now until reveal (default: event end + 2 h)
// --date-stamp  Burn the orange date into each photo
//
// Uses the secret key (bypasses RLS), so it only runs locally.
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    hours: { type: "string", default: "3" },
    "reveal-in": { type: "string" },
    "date-stamp": { type: "boolean", default: false },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Missing Supabase env vars. Is .env.local filled in?");
  process.exit(1);
}

// 12 chars from [a-z0-9] ≈ 62 bits of randomness: not guessable.
const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
const slug = Array.from({ length: 12 }, () => alphabet[randomInt(36)]).join("");

const now = new Date();
const endsAt = new Date(now.getTime() + Number(values.hours) * 3600_000);
const revealAt = values["reveal-in"]
  ? new Date(now.getTime() + Number(values["reveal-in"]) * 60_000)
  : undefined; // the database defaults it to ends_at + 2 h

const supabase = createClient(url, secretKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase
  .from("events")
  .insert({
    slug,
    name: values.name ?? `Test event ${now.toTimeString().slice(0, 5)}`,
    starts_at: now.toISOString(),
    ends_at: endsAt.toISOString(),
    reveal_at: revealAt?.toISOString(),
    date_stamp: values["date-stamp"],
  })
  .select("name, ends_at, reveal_at")
  .single();

if (error) {
  console.error("Could not create event:", error.message);
  process.exit(1);
}

const fmt = (iso) =>
  new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
console.log(`
Created "${data.name}"
  ends:    ${fmt(data.ends_at)}
  reveal:  ${fmt(data.reveal_at)}

  local:   http://localhost:3000/e/${slug}
  online:  https://cam-a-society.vercel.app/e/${slug}
`);
