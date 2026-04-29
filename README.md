# Local Business CRM

A small personal CRM for tracking local businesses, website status, outreach stage, notes, follow-ups, and reusable message templates.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## OpenAI setup

Create a `.env.local` file in this folder:

```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-5.4-nano
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
```

`.env.local` is ignored by git so your API key stays local. You can use `.env.local.example` as the reference.

Data is stored in browser `localStorage` for now. The persistence layer is isolated in `lib/storage.ts` so it can later be replaced with Prisma, Supabase, or another database-backed API.
