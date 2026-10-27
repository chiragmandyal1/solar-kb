// Sends a prompt to the model. Groq and Ollama both speak the OpenAI chat format,
// so switching between them is only a change of LLM_BASE_URL + LLM_MODEL in .env.
//   Groq:   LLM_BASE_URL=https://api.groq.com/openai/v1   LLM_API_KEY=gsk_...
//   Ollama: LLM_BASE_URL=http://localhost:11434/v1        LLM_API_KEY=ollama

export const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
export const LLM_MODEL = process.env.LLM_MODEL || "qwen/qwen3.8-27b";
const LLM_API_KEY = process.env.LLM_API_KEY || "";

// Claude fallback: used when Groq is rate-limited (fallback: true) or always (LLM_PRIMARY=claude, to eval it).
// Needs ANTHROPIC_API_KEY. A daily cap keeps the prepaid credit from draining.
const CLAUDE_MODEL = process.env.CLAUDE_FALLBACK_MODEL || "claude-haiku-5-5";
const CLAUDE_DAILY_CAP = Number(process.env.CLAUDE_DAILY_CAP || 300);
const claudeFirst = process.env.LLM_PRIMARY === "claude";
let claude, claudeDay = "", claudeUsed = 0; // ponytail: in-memory count, resets on restart; move to the DB if it must survive deploys

const claudeAvailable = () => !!process.env.ANTHROPIC_API_KEY && (claudeDay !== new Date().toDateString() || claudeUsed < CLAUDE_DAILY_CAP);

async function chatClaude(messages, maxTokens) {
  const today = new Date().toDateString();
  if (claudeDay !== today) { claudeDay = today; claudeUsed = 0; }
  claudeUsed++;
  claude ??= new (await import("@anthropic-ai/sdk")).default();
  // Haiku 5.5 rejects a custom temperature, and thinking is on by default: off, this is plain Q&A over given sources
  const res = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    system: messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n"),
    messages: messages.filter((m) => m.role !== "system"),
  });
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

export class RateLimitError extends Error {
  constructor(retryAfter) {
    super(`Rate limited, retry in ${retryAfter}s`);
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

// waitOnLimit: true = sleep and retry on 429 (terminal, eval); false = throw RateLimitError so the web app can tell the user
export async function chat(messages, { temperature = 0.2, maxTokens = 600, waitOnLimit = true, fallback = false } = {}) {
  if (claudeFirst && claudeAvailable()) return chatClaude(messages, maxTokens);
  const body = { model: LLM_MODEL, messages, temperature, max_tokens: maxTokens };
  // Qwen3 "thinks" out loud first; ask Groq to hide that part
  if (/qwen3/i.test(LLM_MODEL) && LLM_BASE_URL.includes("groq")) body.reasoning_format = "hidden";

  const send = () => fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify(body),
  });
  let res = await send();
  if (res.status === 429 && fallback && claudeAvailable()) {
    console.error("  (groq rate limited, answering with Claude)");
    return chatClaude(messages, maxTokens);
  }
  if (res.status === 429 && !waitOnLimit) throw new RateLimitError(Math.ceil(Number(res.headers.get("retry-after"))) || 10);
  // free tier rate limit: wait and retry (up to 3 times)
  for (let i = 0; i < 3 && res.status === 429; i++) {
    const wait = Number(res.headers.get("retry-after")) || 15;
    console.error(`  (rate limited, waiting ${wait}s)`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await send();
  }
  // some models don't accept reasoning_format: retry once without it
  if (res.status === 400 && body.reasoning_format) {
    const err = await res.text();
    if (!/reasoning_format/i.test(err)) throw new Error(`Model call failed: HTTP 400 ${err}`);
    delete body.reasoning_format;
    res = await send();
  }
  if (!res.ok) throw new Error(`Model call failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); // in case thinking still comes back
}

export async function listModels() {
  const res = await fetch(`${LLM_BASE_URL}/models`, { headers: { Authorization: `Bearer ${LLM_API_KEY}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return (await res.json()).data.map((m) => m.id).sort();
}
