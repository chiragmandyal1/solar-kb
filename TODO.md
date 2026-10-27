# TODO — solar-kb

One line per item. Plan and reasoning live in PLAN.md; what is built lives in PROGRESS.md.

## Active
- [ ] Chat page (React) with cited answers + "what's in the database" topic panel, calls api/ `POST /ask`, `GET /topics`
- [ ] Three.js (react-three-fiber) background: orbiting solar system, camera flies to `focus.body` from the answer

## Next
- [ ] Fix Groq free-tier rate limit (~4 answers/min): fewer or shorter chunks, or another model (PROGRESS.md, Eval)
- [ ] Add harder test questions (comparisons, multi-source) to tests.json
- [ ] Generate a new Groq key (current one was pasted in chat) and update .env

## Pending
- [ ] Google login, 3-4 questions per user, daily total cap (PLAN.md, Stack)
- [ ] Deploy on Oracle Cloud free tier (PLAN.md, Stack)
- [ ] Portfolio README: screenshots, live link, how it works

## Open decisions
- [ ] Keep qwen/qwen3.8-27b for the live demo, or switch if rate limits stay a problem

## Done
- [x] NestJS API in api/: POST /ask returns {answer, refused, sources, focus}, GET /topics groups manifest by body; tested on Venus + off-topic (27 Oct 2026)
- [x] Code pushed to GitHub: chiragmandyal1/solar-kb (27 Oct 2026)
- [x] eval.mjs + 30 tests: 30/30 pass (25 answers, 5 refusals); cut-off lowered to 0.60 (27 Oct 2026)
- [x] ask.mjs works end to end on Groq qwen/qwen3.8-27b, score check + prompt rule both refuse off-topic (27 Oct 2026)
- [x] Indexed 1,197 chunks in Postgres + pgvector; search finds the right chunk first (27 Oct 2026)
- [x] Embeddings decided: bge-small-en-v1.5 via transformers.js (26 Oct 2026)
- [x] Data: 270 clean NASA files (planets, moons, missions, 2 years of news) (26 Oct 2026)
- [x] Plan written (26 Oct 2026)
