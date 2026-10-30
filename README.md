# Arcade

A mobile-first board-game arcade built with plain HTML, CSS, and JavaScript. Chess uses chessboard.js for the board and chess.js for legal rules; the original minimax chess bot runs in a Web Worker. Monopoly is a local pass-and-play game. The shell includes guest profiles, a PWA install manifest, theme toggle, and an optional Supabase account/social layer.

## Run locally

Serve the folder over HTTP (service workers do not run from `file://`):

```powershell
python -m http.server 8080
```

Open `http://localhost:8080`. The chess libraries and piece art load from public CDNs, so the first chess session needs internet access. Use a static host over HTTPS to install the PWA.

## Supabase setup

1. Create a free Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql).
3. Enable email/password under **Authentication → Providers → Email**. For local testing, adjust email confirmation in **Authentication → Settings**.
4. Copy `config.example.js` to `config.js` and enter the project URL and public anon key from **Project Settings → API**. This client-side key is public by design; never put a service-role key in this file. `config.js` is ignored by Git so local credentials stay out of commits.
5. Add your local site and deployed free-host URL under **Authentication → URL Configuration**.

The SQL turns on row-level security for every table. Authenticated users can search public usernames, manage their own profile and requests, see only friendship edges they participate in, and access only games where they are a player. Presence is ephemeral Supabase Realtime presence.

## Free deployment

Publish the folder as a static site using GitHub Pages, Netlify, or Vercel. Set the output/publish directory to the repository root; there is no build command. Add the deployed URL to Supabase's allowed redirect URLs. The anon key is intended for browser use and access is enforced by RLS.

## Included play

- Chess: complete legal rules from chess.js, click/tap and drag moves, promotion picker, history, captured pieces, check and game-ending draw states, clocks, undo, resign, hints, audio toggle, and easy-to-expert alpha-beta bot.
- Monopoly: 2–4 local players, dice, property purchases, rent, tax, Chance and Community Chest cards, jail, houses, bankruptcy, and a winner check.
- Social UI: guest profile and demo online list work immediately. Supabase email accounts, profiles, friend requests, friendships, invitations, and presence become available after configuration.
- PWA: home-screen manifest and cached local app shell.

Run the automated checks with `npm test`.

Online chess invitations create a shared room and synchronize legal moves through Supabase Realtime, with the latest position reloaded after reconnecting. Monopoly is currently local pass-and-play; online Monopoly turns, trading, and auctions remain future work. Guest social data is a local demo and does not persist as a shared account.
