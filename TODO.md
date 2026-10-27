# TODO — solar-kb

One line per item. Plan and reasoning live in PLAN.md; what is built lives in PROGRESS.md.

## Active
- [x] Fill data gaps: Jupiter moons, Titan, missions, re-fetch good news (26 Oct 2026)
- [ ] Write 20-30 test questions with answers from data/ (Claude drafts, I check each answer)

## Next
- [ ] Weekend 1: load data/ into AnythingLLM + Ollama, try the test questions (PLAN.md, Timeline)
- [ ] Build steps 1-3 and 5: NestJS API, chat UI, search, prompt, answer with sources (PLAN.md)
- [ ] Add score check for "not in my documents" and pick the cut-off from test questions (PLAN.md, Rules)
- [ ] Three.js solar system view that zooms to the planet in the answer (PLAN.md, Stack)

## Pending
- [ ] Google login, 3-4 questions per user, daily total cap (PLAN.md, Stack)
- [ ] Deploy on Oracle Cloud free tier with Groq or Gemini free API (PLAN.md, Stack)
- [ ] README for the portfolio

## Open decisions
- [ ] Groq free-tier rate limit hits after ~4 questions/min; fix before going live (fewer/shorter chunks or another model)
- [ ] Add harder test questions (comparisons, multi-source) to tests.json

## Done
- [x] eval.mjs + 30 tests: 30/30 pass (25 answers, 5 refusals); cut-off lowered to 0.60 (27 Oct 2026)
- [x] ask.mjs works end to end on Groq qwen/qwen3.8-27b: 4/4 test questions right, incl. off-topic (score check) and exoplanet (prompt rule) (27 Oct 2026)
- [x] Indexed 1,197 chunks; search finds the right chunk for 4/4 test questions, off-topic scores 0.53 (27 Oct 2026)
- [x] ask.mjs written: search + score cut-off 0.65 + Groq qwen3-32b + cited sources + zoom planet (27 Oct 2026)
- [x] Indexing code written: index.mjs, search.mjs, lib/ (26 Oct 2026)
- [x] Embeddings decided: bge-small-en-v1.5 via transformers.js (26 Oct 2026)
- [x] Plan written (26 Oct 2026)
- [x] Download script written and run, 58 clean files (26 Oct 2026)
