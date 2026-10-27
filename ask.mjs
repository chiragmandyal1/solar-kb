// Ask one question in the terminal.
// Run: npm run ask -- "how hot is Venus"
//      npm run ask -- --models        list the models your API key can use
import { connect } from "./lib/db.mjs";
import { answerQuestion } from "./lib/answer.mjs";
import { listModels } from "./lib/llm.mjs";

const arg = process.argv.slice(2).join(" ").trim();
if (!arg) { console.log('Usage: npm run ask -- "your question"'); process.exit(1); }
if (arg === "--models") { console.log((await listModels()).join("\n")); process.exit(0); }

const db = await connect();
const r = await answerQuestion(db, arg);
await db.end();

console.log(`\nQ: ${r.question}`);
console.log(`(best match score ${r.topScore.toFixed(3)}, cut-off ${r.minScore})\n`);
console.log(r.answer);
if (r.sources.length) {
  console.log("\nSources:");
  for (const s of r.sources) console.log(`  ${s.nums.map((n) => `[${n}]`).join("")} ${s.title} - ${s.url}`);
}
if (r.focus) console.log(`\nZoom to: ${r.focus.body}${r.focus.subject ? ` (${r.focus.subject})` : ""}`);
console.log(r.modelCalled ? `[search ${r.searchMs} ms, total ${r.totalMs} ms, model ${r.model}]` : `[search ${r.searchMs} ms, model not called]`);
