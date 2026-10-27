# PROGRESS — solar-kb

Updated: 27 Oct 2026

## Current state
- Plan decided: PLAN.md (also saved in claude.ai Career project, knowledge-base-project/PLAN.md).
- Data downloaded: data/ has 58 Markdown files, about 50k words.
  - 24 planet pages: overview + facts for Sun, 8 planets, Moon, Pluto, Ceres. All clean.
  - 34 news articles from 21 Jul to 23 Oct 2026, max 8 per planet. No news for Mercury, Uranus, Neptune, Pluto, Ceres, Earth (expected, NASA rarely posts about them).
  - Each file has a header: title, source_url, body (planet), type, date.
- Data (26 Oct, after 2 runs + hand clean-up): 271 files, ~215k words. 24 planet pages, 43 moons, 21 missions, ~183 news. Jupiter big moons, Titan, Europa Clipper, Dawn, Juno now in.
- download.mjs now keeps existing files and only downloads missing ones (--fresh to start over), extracts hub pages better, adds Jupiter's big moons + Titan, filters junk by URL/title, saves failed pages to debug/.
- Numbers in the bullets above are from the first small run.
- download.mjs: Node script. Clears data/, downloads pages + news, cuts link junk at page ends, skips exoplanets, tiny pages and a hand-made blocklist.
- Indexing built (not yet run on the Mac): index.mjs chunks at headings (~300 words, 50-word overlap), embeds with bge-small-en-v1.5 in Node, stores in Postgres + pgvector (HNSW index + keyword column). search.mjs prints top 5 with scores. Dry run on all data: 1,197 chunks, median 224 words.
- Tested in the cloud with fake embeddings and a real Postgres + pgvector: indexing, re-run skipping unchanged files, and search all work. The real model was not tested there (download blocked).

## Known issues
- News planet tagging just counts mentions, so some articles land under the wrong planet. Wrong ones go on the BLOCKLIST in download.mjs.
- Re-running download.mjs fetches fresh news, so the file set changes each run. Re-check new files after a run.
- download.mjs was never run from Claude's side (no network there); only checked on Chirag's Mac.

## Eval (27 Oct 2026)
- `npm run eval`: 30/30 pass on Groq qwen/qwen3.8-27b. Real questions score 0.65-0.88; off-topic 0.49-0.69. Exoplanet traps (0.68-0.69) pass the score check and are refused by the prompt rule.
- MIN_SCORE lowered 0.65 -> 0.60: the Great Red Spot question scored exactly 0.65.
- Groq free tier rate-limits after ~4 answers a minute (waits of 4-32 s); real answer time is under 1 s.

## Repo
- Pushed to GitHub: chiragmandyal1/solar-kb, first commit 1b1a77a (27 Oct 2026). .env, node_modules, debug/ and eval-results.json are ignored; data/ is committed.
