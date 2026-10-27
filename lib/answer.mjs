// Steps 1-5 as one function: question -> search -> (score check) -> prompt -> model -> answer.
// Used by ask.mjs (terminal), eval.mjs (tests) and later the web API.
import { retrieve, MIN_SCORE } from "./retrieve.mjs";
import { chat, LLM_MODEL } from "./llm.mjs";

export const NOT_FOUND = "I couldn't find that in my documents. I can only answer questions about our solar system from NASA's pages.";

const SYSTEM = `You answer questions about our solar system using ONLY the numbered sources given.
Rules:
- Use only facts found in the sources. Do not add facts from your own knowledge.
- If the sources do not contain the answer, reply exactly: "${NOT_FOUND}"
- Cite sources inline like [1] or [2][3] after the sentence they support.
- Plain English for a general reader. 2-5 sentences unless the question needs more.
- Use the units the sources use; if they give both miles and kilometers, give both.`;

export async function answerQuestion(db, question, llmOptions = {}) {
  const t0 = Date.now();
  const { chunks, topScore, onTopic } = await retrieve(db, question);
  const searchMs = Date.now() - t0;
  const base = { question, topScore, minScore: MIN_SCORE, model: LLM_MODEL, searchMs };

  // Layer 1: nothing close enough -> don't call the model at all
  if (!onTopic) return { ...base, answer: NOT_FOUND, refused: true, modelCalled: false, sources: [], focus: null, totalMs: searchMs };

  // Layer 2: the model, told to answer only from these sources
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title}${c.heading ? " > " + c.heading : ""}\n${c.content}`)
    .join("\n\n");
  const answer = await chat([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Sources:\n\n${context}\n\nQuestion: ${question}` },
  ], llmOptions);
  const refused = answer.startsWith("I couldn't find that");

  // sources the answer actually cited, grouped by page
  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))].filter((n) => chunks[n - 1]);
  const byUrl = new Map();
  for (const n of cited) {
    const c = chunks[n - 1];
    if (!byUrl.has(c.url)) byUrl.set(c.url, { title: c.title, url: c.url, nums: [] });
    byUrl.get(c.url).nums.push(n);
  }
  // planet for the 3D view: the planet of the first cited source; none if refused
  const f = refused ? null : chunks[(cited[0] || 1) - 1];
  const focus = f ? { body: f.body, subject: f.subject && f.subject !== f.body ? f.subject : null } : null;

  return { ...base, answer, refused, modelCalled: true, sources: [...byUrl.values()], focus, totalMs: Date.now() - t0 };
}
