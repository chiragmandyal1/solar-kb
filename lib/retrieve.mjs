// Finds the chunks that best match a question: vector search (meaning) + keyword search (exact names).
import { embedQuery, toSql } from "./embed.mjs";

export const MIN_SCORE = Number(process.env.MIN_SCORE || 0.65); // below this: "not in my documents"
const VECTOR_K = 8;   // closest chunks by meaning
const KEYWORD_K = 3;  // best chunks by exact words
const FINAL_K = 6;    // chunks sent to the model

// chunks that are mostly links ("More NASA News", "Discover the cosmos!") carry no facts
function mostlyLinks(text) {
  const linkChars = (text.match(/\[[^\]]*\]\([^)]*\)/g) || []).join("").length;
  return linkChars / Math.max(text.length, 1) > 0.4;
}

export async function retrieve(db, question) {
  const v = toSql(await embedQuery(question));

  const { rows: byMeaning } = await db.query(
    `SELECT c.id, d.title, d.body, d.subject, d.type, d.url, c.heading, c.content,
            1 - (c.embedding <=> $1) AS score
       FROM chunks c JOIN documents d USING (file)
      ORDER BY c.embedding <=> $1
      LIMIT $2`,
    [v, VECTOR_K],
  );

  const { rows: byWords } = await db.query(
    `SELECT c.id, d.title, d.body, d.subject, d.type, d.url, c.heading, c.content,
            1 - (c.embedding <=> $1) AS score
       FROM chunks c JOIN documents d USING (file)
      WHERE c.tsv @@ websearch_to_tsquery('english', $2)
      ORDER BY ts_rank(c.tsv, websearch_to_tsquery('english', $2)) DESC
      LIMIT $3`,
    [v, question, KEYWORD_K],
  );

  // merge, drop duplicates and link-only chunks, best meaning score first
  const seen = new Set();
  const chunks = [...byMeaning, ...byWords]
    .filter((r) => !seen.has(r.id) && seen.add(r.id) && !mostlyLinks(r.content))
    .sort((a, b) => b.score - a.score)
    .slice(0, FINAL_K);

  const top = chunks[0]?.score ?? 0;
  return { chunks, topScore: top, onTopic: top >= MIN_SCORE };
}
