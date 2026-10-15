# A Society Cam

A shared **disposable camera** web app for The A Society wellness community events.

Guests scan a QR code, pick a nickname and get a 12-shot camera right in the browser — nothing to install. Photos get a warm 35mm film look and stay **locked until the reveal time** (by default two hours after the event ends). Then everyone can browse and download the full roll, with each print "developing" on screen the first time it's opened.

> 🚧 Work in progress — built in phases. A full write-up with screenshots and a live demo will land here once the MVP ships.

## Tech stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS**, mobile-first PWA
- **Supabase** — Postgres with Row Level Security, private Storage, anonymous auth
- **WebGL** — custom film-emulation shader applied on-device before upload
- **Vercel** — hosting and scheduled jobs

## Highlights (planned)

- Reveal lock enforced **server-side** with RLS: signed URLs can't be generated before reveal time.
- Shot limit enforced in the database with an idempotent, race-safe RPC.
- Offline-tolerant upload queue (IndexedDB + retries).
- GDPR-friendly: privacy notice, deletion requests and automatic purge after 90 days.

## Getting started

```bash
cp .env.example .env.local   # fill in your Supabase keys
npm install
npm run dev
```

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Start the dev server                              |
| `npm run lint`      | ESLint                                            |
| `npm run format`    | Format all files with Prettier                    |
| `npm run typecheck` | TypeScript check                                  |
| `npm test`          | Unit tests (Vitest)                               |
| `npm run icons`     | Regenerate PNG icons from `public/icons/icon.svg` |
