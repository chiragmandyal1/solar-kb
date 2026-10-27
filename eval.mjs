// Runs every question in tests.json and reports pass/fail.
// Run: npm run eval            full report, answers saved to eval-results.json
//      npm run eval -- 5       only the first 5 tests
import fs from "node:fs/promises";
import { connect } from "./lib/db.mjs";
import { answerQuestion } from "./lib/answer.mjs";

const PAUSE_MS = 2500; // stay under the free-tier rate limit
const { tests } = JSON.parse(await fs.readFile("tests.json", "utf8"));
const limit = Number(process.argv[2]) || tests.length;
const db = await connect();
const results = [];

for (const t of tests.slice(0, limit)) {
  const r = await answerQuestion(db, t.q);
  const text = r.answer.toLowerCase();
  const problems = [];
  if (t.refuse) {
    if (!r.refused) problems.push("should have refused");
  } else {
    if (r.refused) problems.push("refused but answer is in the data");
    for (const group of t.expect || []) if (!group.some((w) => text.includes(w.toLowerCase()))) problems.push(`missing: ${group.join(" / ")}`);
    if (!r.sources.length) problems.push("no sources cited");
    if (t.planet && r.focus?.body !== t.planet) problems.push(`zoom ${r.focus?.body || "none"}, expected ${t.planet}`);
  }
  const pass = problems.length === 0;
  results.push({ ...t, pass, problems, score: r.topScore, modelCalled: r.modelCalled, ms: r.totalMs, answer: r.answer, sources: r.sources.map((s) => s.url) });
  console.log(`${pass ? "PASS" : "FAIL"}  ${r.topScore.toFixed(2)}  ${t.q}${pass ? "" : `\n        -> ${problems.join("; ")}\n        answer: ${r.answer.replace(/\s+/g, " ").slice(0, 200)}`}`);
  if (r.modelCalled) await new Promise((res) => setTimeout(res, PAUSE_MS));
}
await db.end();

const passed = results.filter((r) => r.pass).length;
const answers = results.filter((r) => !r.refuse), refusals = results.filter((r) => r.refuse);
const avgMs = Math.round(results.filter((r) => r.modelCalled).reduce((s, r) => s + r.ms, 0) / Math.max(1, results.filter((r) => r.modelCalled).length));
console.log(`\n${passed}/${results.length} passed  (answers ${answers.filter((r) => r.pass).length}/${answers.length}, refusals ${refusals.filter((r) => r.pass).length}/${refusals.length}), avg ${avgMs} ms per answer`);
const lowestRight = Math.min(...answers.map((r) => r.score)), highestOff = Math.max(...refusals.map((r) => r.score));
console.log(`scores: lowest real question ${lowestRight.toFixed(2)}, highest off-topic ${highestOff.toFixed(2)} (cut-off ${process.env.MIN_SCORE || 0.65})`);
await fs.writeFile("eval-results.json", JSON.stringify({ at: new Date().toISOString(), passed, total: results.length, results }, null, 2));
console.log("Full answers saved to eval-results.json");
