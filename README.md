# Local Business CRM

A small personal CRM for tracking local businesses, website status, outreach stage, notes, follow-ups, and reusable message templates.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

Data is stored in browser `localStorage` for now. The persistence layer is isolated in `lib/storage.ts` so it can later be replaced with Prisma, Supabase, or another database-backed API.
