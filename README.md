# solar-kb

Ask questions about the solar system and get cited answers from NASA's own pages.
RAG pipeline: NASA pages → chunks → Postgres + pgvector → open LLM (Groq, or local Ollama). Off-topic questions are refused.

Full plan: `PLAN.md` · status: `PROGRESS.md` · next work: `TODO.md`.

## Step 1: download the data

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

## Step 2: chunks + vector database

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

## Step 3: ask questions

```bash
npm run ask -- "how hot is Venus"
npm run ask -- --models          # models your key can use
```

- Settings live in `.env` (not committed; copy `.env.example`): model URL, key, model name, `MIN_SCORE` cut-off.
- If the best match scores below `MIN_SCORE`, it answers "not in my documents" without calling the model.
- To run fully local: `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_API_KEY=ollama`, `LLM_MODEL=qwen3:30b` (needs Ollama).

## Step 4: test it

```bash
npm run eval          # runs the 30 questions in tests.json, prints PASS/FAIL
```

- A question passes if the answer has the expected facts, cites a source and zooms to the right planet, or correctly refuses.
- Full answers are saved to `eval-results.json` (not committed).
- Last run: 30/30 (27 Oct 2026).
