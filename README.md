# Stash

**Save anything. Organize it how your brain works. Come back exactly when you need it.**

Stash is an open-source, self-hosted *save-for-later* app. Share a link, a video, a recipe, a workout, an article — or paste raw text — and Stash turns it into something you can actually find again: auto-titled, summarized, tagged, and filed into collections. Bring your own AI key (or run fully local), and your data never leaves your server.

![license](https://img.shields.io/badge/license-AGPL--3.0-or-later-blue)

- **Self-hosted & private** — your saves, notes, tags and AI keys live on *your* machine. No account service, no telemetry, no third-party cloud.
- **BYO AI** — plug in OpenAI, Google Gemini, Anthropic, Groq, OpenRouter, or any OpenAI-compatible endpoint (Ollama/LM Studio/vLLM). Keys are encrypted at rest. Or skip AI entirely — Stash works fine without it.
- **PWA mobile install** — add to your home screen and share straight into it from any app via the Web Share Target.
- **AI with a receipt** — every AI call is logged with provider, model and token counts. No black-box spending.

---

## Features

- Save links (video, recipe, article, product…), plain text, or both, from the app or via OS "Share to Stash"
- Automatic title, thumbnail and source detection (oEmbed for YouTube, Vimeo, TikTok, Reddit, SoundCloud, Spotify…; OpenGraph for the rest)
- **AI enrichment** — fix/title, 1–3 sentence summary, smart category + tags, and structured *recipe* (ingredients/steps/servings/times) or *workout* (exercises/sets/reps) extraction, all from one call
- **Collections** — manual folders plus **smart collections** that auto-file matching saves
- **Decide for me** — random picker over your unconsumed stash (great for "what should I watch tonight?")
- Search across titles, notes, recipes, tags; filter by type/status
- Mark done, star favourites, swipe-to-done on touch
- Full **export / import** (JSON backup or CSV), per-account data isolation
- **AI cost transparency** — per-call logs with provider/model/tokens so you can see what each feature spends
- Light/dark mode, installable PWA with offline app shell
- Pluggable provider presets incl. fully **local/offline** AI

## Architecture

```
apps/web      Next.js PWA (React 19, Tailwind v4, SWR) — the UI
apps/api      Fastify API (Node, SQLite via node:sqlite) — all data + AI
packages/shared shared TypeScript types
```

- **Database:** SQLite (built into Node.js — zero native compilation). Single file; easy to back up.
- **`node:sqlite`** means the API has only two non-runtime concerns: `fastify`, `@fastify/cors`, `zod`, and the shared types. No ORM, no native modules.
- The web app talks to the API through a Next.js **rewrite** (`/api/*` → API), so there's no CORS in production and no cross-origin issues.
- **Secrets:** AI API keys are encrypted at rest with AES-256-GCM. Sessions are signed HMAC tokens. The first registered account is the bootstrap admin; further signups are disabled by default.

## Quick start (Docker Compose)

```bash
git clone <your-stash-repo-url> && cd stash
cp .env.example .env        # tweak STASH_PORT / STASH_SECRET / STASH_ALLOW_SIGNUP
docker compose up -d --build
```

Then open `http://localhost:3000`, register the first account, and go to **Settings → AI** to connect your provider.

- Web UI: port `3000` (change with `STASH_PORT`)
- API: internal only (`api:4000`)
- Data: named volume `stash-data` (SQLite DB + generated secret)

### Updating

```bash
git pull && docker compose up -d --build
```

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `STASH_PORT` | `3000` | Host port for the web UI (Compose) |
| `STASH_SECRET` | *(auto-generated)* | Secret for encrypting AI keys & signing sessions. Auto-generated into the data dir on first run if unset |
| `STASH_ALLOW_SIGNUP` | `false` | Allow new account registration after the first one |
| `STASH_DATA_DIR` | `./data` | Where the API stores the SQLite DB and generated secret |
| `PORT` | `4000` | API listen port (non-Compose runs) |
| `API_PROXY_URL` | `http://localhost:4000` | Where the web app rewrites `/api/*` to (set at build time) |

## Local development

Requires **Node ≥ 22.5** (for `node:sqlite`).

```bash
npm install --include-workspace-root
npm run dev
```

This starts the API (port 4000) and the web app (port 3000) concurrently. Open `http://localhost:3000`.

Useful scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Build shared, API, and web |
| `npm run typecheck` | Type-check all workspaces |
| `npm test` | Run API integration tests |
| `npm run dev` | Dev servers for API + web |
| `npm run start --workspace @stash/web` | Run the built web app (`next start`) |

## AI providers

Configure in **Settings → AI**. Pick a preset, drop in a key (encrypted at rest), hit **Test**.

| Provider | How to get a key |
| --- | --- |
| OpenAI | platform.openai.com |
| Google Gemini | aistudio.google.com (free tier) |
| Anthropic (OpenAI-compat endpoint) | console.anthropic.com |
| Groq | console.groq.com (free/cheap) |
| OpenRouter | openrouter.ai (one key, many models) |
| **Local** (Ollama / LM Studio) | run locally — fully offline, no key |

Every feature can use its own model override (e.g. a fast local model for tagging, a bigger one for summaries). All calls are logged under **Settings → AI activity** with token counts and latency.

### AI features

`summarize`, `categorize` (title fix + type + tags), `extractRecipe`, `extractWorkout`. Each can be left on, turned off, or pointed at a different model. If no AI key is configured, saving works perfectly normally — enrichment is just skipped.

## Backups & your data

- The SQLite database lives in `STASH_DATA_DIR` (`/data` in Docker). Copy the volume to back up everything — it's a single file.
- **Settings → Export** downloads a full JSON backup (items + collections). **Import** restores it — or accepts a simple CSV: `title,url,tags|pipe-separated,collection,done`.
- Structures like recipes (`extracted`) and AI bookkeeping (`provider`, `model`) are preserved in exports.

## License

[AGPL-3.0-or-later](LICENSE) — free software, strong copyleft. If you run a modified Stash for users over a network, sharing that modified source is part of the deal. That's the whole point: private tools shouldn't be a trap.

---

Built for people who save *like a hoarder* but want to find things *like a librarian*.