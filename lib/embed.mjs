// Turns text into vectors (lists of numbers that capture meaning).
// Runs inside Node with transformers.js: no Ollama, no API key, works the same on the Mac and the server.
// The SAME model must be used for indexing and for questions, or the scores mean nothing.

import { pipeline } from "@huggingface/transformers";

export const EMBED_MODEL = "Xenova/bge-small-en-v1.5"; // small (~130 MB), fast on CPU, good for English
export const EMBED_DIMS = 384;
// bge models want this prefix on questions (not on the stored chunks)
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor;
async function model() {
  // FAKE_EMBED=1 is only for testing without downloading the model
  if (process.env.FAKE_EMBED) return fakeExtractor;
  if (!extractor) extractor = await pipeline("feature-extraction", EMBED_MODEL);
  return extractor;
}

// texts -> array of vectors (each EMBED_DIMS long, normalized)
export async function embedPassages(texts, batchSize = 16) {
  const ex = await model();
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const res = await ex(texts.slice(i, i + batchSize), { pooling: "cls", normalize: true });
    out.push(...res.tolist());
  }
  return out;
}

export async function embedQuery(question) {
  const [v] = await embedPassages([QUERY_PREFIX + question]);
  return v;
}

// pgvector wants '[0.1,0.2,...]'
export const toSql = (v) => `[${v.join(",")}]`;

// ---- test-only stand-in: same text -> same vector, shared words -> closer vectors ----
async function fakeExtractor(texts) {
  const vecs = texts.map((t) => {
    const v = new Array(EMBED_DIMS).fill(0);
    for (const w of t.toLowerCase().match(/[a-z]{3,}/g) || []) {
      let h = 0;
      for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      v[h % EMBED_DIMS] += 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  });
  return { tolist: () => vecs };
}
