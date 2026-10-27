# Solar-kb

Ask questions about the solar system and get cited answers from NASA's own pages. Live at **https://solarkb.com**.

A RAG (retrieval-augmented generation) project: NASA pages → chunks → Postgres + pgvector → an open LLM. Every answer cites its sources, and off-topic questions are refused. The page is a 3D solar system that flies to the planet or moon your answer is about.

Not affiliated with or endorsed by NASA.

## How it works

```
 browser (React + Three.js)  ──/api──▶  Caddy (HTTPS)  ──▶  NestJS API  ──▶  lib/ (RAG pipeline)
                                                                  │                │
                                                       Postgres: users,     question → vector + keyword search
                                                       daily counts         → prompt → Groq (or Claude fallback)
                                                                  └──────── Postgres + pgvector: chunks
```

- **Data:** 271 Markdown files from science.nasa.gov (planets, moons, missions, ~2 years of news) in `data/`, 1,197 chunks indexed.
- **Answers:** top chunks go to the model with the question. The model may only use them, and must cite `[1]`, `[2]`. If the best match scores below `MIN_SCORE`, the model is not called at all.
- **Model:** Groq `qwen/qwen3.8-27b` (free tier). When Groq is rate-limited, Claude Haiku 5.5 answers instead (capped per day). If both fail, the page shows "Busy, retrying in Ns" and retries.
- **Limits:** 2 questions a day per IP address, 50 a day after signing in with Google, and a site-wide daily cap, so the free quotas last.
- **Eval:** 30 test questions (25 answers, 5 refusals). 30/30 pass on Groq and on Haiku 5.5.

## Repo layout

| Path | What |
|---|---|
| `download.mjs`, `index.mjs`, `search.mjs`, `ask.mjs`, `eval.mjs` | The pipeline, one script per step (see steps below) |
| `lib/` | Shared code: chunking, embeddings, retrieval, prompt, model calls |
| `api/` | NestJS API: `POST /ask`, `GET /topics`, `GET /me`, Google login, per-day limits |
| `web/` | Vite + React + react-three-fiber frontend |
| `Dockerfile.api`, `Dockerfile.web`, `Caddyfile`, `docker-compose.prod.yml` | Production stack (db, api, Caddy + built page) |
| `deploy.sh` | Copies the code to the server and rebuilds |
| `data/` | The NASA pages as Markdown, with `manifest.json` |

## Run it locally

```bash
npm install && (cd api && npm install) && (cd web && npm install)
cp .env.example .env            # add a Groq key (and optionally the Anthropic / Google values)
npm run db                      # Postgres + pgvector in Docker
npm run index                   # chunk + embed + store (first run downloads a ~130 MB model)
(cd api && npm start)           # API on :3100
(cd web && npm run dev)         # page on :5173, proxies /api to the API
```

Without `GOOGLE_CLIENT_ID` the sign-in button is replaced by a note; the 2-question guest limit still applies.

## Configuration (`.env`, never committed)

| Variable | Meaning |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | Any OpenAI-compatible model (Groq by default, Ollama works) |
| `MIN_SCORE` | Retrieval cut-off, 0.60 |
| `ANTHROPIC_API_KEY`, `CLAUDE_DAILY_CAP` | Optional Claude fallback and its daily cap (default 300) |
| `GOOGLE_CLIENT_ID`, `SESSION_SECRET` | Google sign-in (web also needs `VITE_GOOGLE_CLIENT_ID` in `web/.env.local`) |
| `ANON_DAILY_LIMIT`, `USER_DAILY_LIMIT`, `SITE_DAILY_LIMIT` | 2, 50 and 1000 questions per day |
| `DB_PASSWORD`, `DOMAIN`, `TRUST_PROXY` | Production only (compose file) |

## Deploy

The server runs `docker-compose.prod.yml`: Postgres, the API, and Caddy, which serves the built page, forwards `/api`, and gets a Let's Encrypt certificate for `DOMAIN`. The server keeps its own `.env`. The live site currently runs on a temporary server.

```bash
echo 'DEPLOY_HOST=user@server-ip' > .deploy.env    # once (ignored by git)
./deploy.sh                                         # copy code, rebuild, restart
```

First setup on a new server: install Docker, copy the repo and a `.env`, run `docker compose -f docker-compose.prod.yml up -d --build`, then load the data (`pg_dump -t documents -t chunks` from a machine that already ran `npm run index`, restored after `CREATE EXTENSION vector`).

## Credits

Planet and moon facts come from NASA's public pages (science.nasa.gov). Each file in `data/` starts with a header whose `source_url` links back to the NASA page.

## The pipeline, step by step

### Step 1: download the data

```bash
npm install
npm run download              # keeps existing files, downloads only what's missing
npm run download -- --fresh   # delete data/ and start over
npm run download -- --no-news # skip the slow news part
```

- Saves NASA planet pages (overview + facts), moon pages, mission pages and 2 years of NASA news as Markdown in `data/<planet>/`.
- Each file starts with a header: title, source_url, body (planet), type, date. `body` is what the 3D view zooms to.
- `data/manifest.json` lists every file, word counts and failures.
- Pages whose text can't be extracted are saved to `debug/` for fixing.
- Then open a few `.md` files and check they read cleanly (no menus, no footers).

Settings (topic list, how many news items, how far back) are at the top of `download.mjs`.

### Step 2: chunks + vector database

```bash
npm install                      # adds pg + transformers.js
npm run db                       # starts Postgres + pgvector in Docker (docker-compose.yml)
npm run index                    # chunk + embed + store (first run downloads the embedding model, ~130 MB)
npm run search -- "how many moons does Mars have"
```

- `npm run index -- --dry` shows chunk stats without a database.
- Re-running `npm run index` only re-indexes new or changed files and removes deleted ones. `--reset` starts over.
- Embeddings: `Xenova/bge-small-en-v1.5` (384 numbers per chunk), run inside Node. Same model on the Mac and the server, no API key.
- Tables: `documents` (one row per file) and `chunks` (one row per chunk, with `embedding` and a keyword-search column).
- Database URL can be changed with `DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/solarkb`).

### Step 3: ask questions

```bash
npm run ask -- "how hot is Venus"
npm run ask -- --models          # models your key can use
```

- Settings live in `.env` (not committed; copy `.env.example`): model URL, key, model name, `MIN_SCORE` cut-off.
- If the best match scores below `MIN_SCORE`, it answers "not in my documents" without calling the model.
- To run fully local: `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=qwen3:30b` (needs Ollama).

### Step 4: test it

```bash
npm run eval          # runs the 30 questions in tests.json, prints PASS/FAIL
```

- A question passes if the answer has the expected facts, cites a source and zooms to the right planet, or correctly refuses.
- Full answers are saved to `eval-results.json` (not committed).
- Last run: 30/30 (27 Oct 2026).
