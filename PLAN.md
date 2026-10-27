# Knowledge Base Project (RAG) — Plan

Portfolio project. Upload documents → ask questions → answers come only from those documents, with sources. Later sold to companies as a private knowledge base.

## What it is (RAG)
- The model is NOT trained on the data. On every question, the app finds the relevant chunks and gives them to the model with the question.
- Two phases: **Indexing** (once per file change) and **Answering** (every question).

## Who does what
1. App gets the question.
2. App searches the vector database and picks the top ~5 chunks.
3. App sends question + chunks to the model.
4. Model (Ollama locally, or a free API) writes the answer — this is the only step we don't build.
5. App shows the answer with source files.

## What we build
- **Step 0 – Indexing:** upload → file (Markdown/PDF) to text → strip junk (menus, footers) → chunk (~300–500 words, split at headings) → embed → store with metadata (doc_id, title, source_url). Replacing a file deletes its old chunks.
- **Step 1 – Question API + chat UI:** NestJS API, simple React chat, Google login.
- **Step 2 – Search:** vector search + keyword search (vectors are bad at exact names/codes).
- **Step 3 – Prompt:** "Answer only from these chunks. If not there, say I don't know. Cite the file."
- **Step 4 – Model:** nothing to build. Call Groq with an OpenAI-compatible client; base URL + model name come from config, never hardcoded. Ollama speaks the same format, so going local later = change those two values (`localhost:11434`). No local version until a client asks.
- **Step 5 – Answer:** stream it, show sources, thumbs up/down logged.
- **Test script:** runs 20–30 test questions and scores answers.

## Stack (decided)
| Part | Choice | Why |
|---|---|---|
| Data | Solar system pages from science.nasa.gov + recent NASA mission news (last 6–12 months), saved as files | Plain English for normal people, public domain; recent news proves answers come from the files, not model memory |
| Front end | Three.js solar system; model returns `{answer, planet}` and the view zooms to that planet | Visual hook for the portfolio |
| Backend | NestJS | Already known |
| Vector DB | Postgres + pgvector | One DB for users, limits, logs and vectors. Handles millions of chunks. Scale later: pgvectorscale or Qdrant |
| Model (live demo) | Groq free API, `qwen/qwen3.8-27b` (open, mid-size) | $0; same open model a client could run locally on 32 GB |
| Model (local mode) | Ollama — only when a client asks, config change only | Private, nothing leaves the machine |
| Embeddings | `Xenova/bge-small-en-v1.5` via transformers.js in Node (384 dims) | No GPU, no API key, same on Mac and server |
| Hosting | Oracle Cloud free tier | Always on, $0 |
| Access | Google login, 3–4 questions per user + global daily cap (~200) | Protects free API quota |

## Rules / decisions
- Never use work (ksdac) data. Public data only.
- Free API tiers may use sent data for training → fine for public demo, never for client data.
- Client pitch: "Demo uses a free API. On your server it runs the same open model privately via Ollama."
- Demo model = model the client can actually run. Don't oversell with a bigger cloud model.
- Bigger models stick to your data better; small models make things up more. Faithfulness comes from the prompt + retrieval.
- Test questions: Claude drafts, I check every answer against the documents myself.
- "Not in my documents" uses two layers: score check in code (blocks off-topic questions, saves API quota) + prompt rule (blocks on-topic questions whose answer isn't in the files, e.g. exoplanets).
- Score = how close the question's meaning-numbers are to a chunk's (1 = same, 0 = unrelated). Pick the cut-off by testing 20 on-topic vs 20 off-topic questions.
- Every answer shows its source chunk + link.

## Data download
- `nasa-downloader-guide.md` (this folder) targets NTRS technical reports — not usable for the solar system topic. Kept for reference only.

## Open items
- Moved to TODO.md. Status lives in PROGRESS.md.

## Timeline
- Done (26-27 Oct): data, indexing, search, ask, eval (30/30).
- Next: web app (NestJS API + chat page), then Three.js view, then login + limits, then deploy.
- AnythingLLM step was skipped: built the pipeline directly instead.
