// Test the search: prints the top chunks for a question with their scores.
// Run: npm run search -- "how many moons does Mars have"

import { embedQuery, toSql } from "./lib/embed.mjs";
import { connect } from "./lib/db.mjs";

const question = process.argv.slice(2).join(" ").trim();
if (!question) { console.log('Usage: npm run search -- "your question"'); process.exit(1); }

const db = await connect();
const v = toSql(await embedQuery(question));

// score = cosine similarity: 1 = same meaning, 0 = unrelated
const { rows } = await db.query(
  `SELECT d.title, d.body, d.type, d.url, c.heading, c.content,
          1 - (c.embedding <=> $1) AS score
     FROM chunks c JOIN documents d USING (file)
    ORDER BY c.embedding <=> $1
    LIMIT 5`,
  [v],
);

console.log(`\nQ: ${question}\n`);
for (const r of rows) {
  console.log(`${r.score.toFixed(3)}  [${r.body}/${r.type}] ${r.title}${r.heading ? " > " + r.heading : ""}`);
  console.log(`       ${r.content.replace(/\s+/g, " ").slice(0, 160)}...`);
  console.log(`       ${r.url}\n`);
}
await db.end();
