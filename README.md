# Sports Hub

One private page with every team's schedule and chats (Heja, GroupMe, PlayMetrics, TeamSnap, TeamSnap ONE).

## What works today
- **Schedule:** merges every team calendar link into one list, grouped by day, with filters per team.
- **Messages:** GroupMe chats, with replies sent from here.
- **Password gate:** the whole app sits behind `APP_PASSWORD`.

## Setup
1. Copy `.env.example` to `.env.local` and fill it in.
   - Calendar links: open each app's calendar "sync" or "subscribe" option and copy the link.
   - GroupMe token: sign in at https://dev.groupme.com and click "Access Token".
2. `npm install && npm run dev`, then open http://localhost:3000.

## Deploy (Vercel)
Import this repo at https://vercel.com/new and add the same three environment variables.
