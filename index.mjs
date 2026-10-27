// Step 0: indexing. Reads data/**/*.md, chunks each file, embeds the chunks, stores them in Postgres.
//
// Run:   npm run index            only new/changed files are re-indexed, deleted files are removed
//        npm run index -- --dry   just print chunk stats, no database or model needed
//        npm run index -- --reset drop everything and index all files again

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { chunkFile } from "./lib/chunk.mjs";
import { embedPassages, toSql, EMBED_MODEL } from "./lib/embed.mjs";
import { connect, createTables } from "./lib/db.mjs";

const DATA_DIR = "data";
const args = new Set(process.argv.slice(2));

async function listFiles() {
  const out = [];
  for (const dir of await fs.readdir(DATA_DIR)) {
    const full = path.join(DATA_DIR, dir);
    if (!(await fs.stat(full)).isDirectory()) continue;
    for (const f of await fs.readdir(full)) if (f.endsWith(".md")) out.push(path.join(full, f));
  }
  return out.sort();
}

async function dryRun(files) {
  let total = 0;
  const sizes = [];
  for (const f of files) {
    const { chunks } = chunkFile(await fs.readFile(f, "utf8"));
    total += chunks.length;
    sizes.push(...chunks.map((c) => c.words));
  }
  sizes.sort((a, b) => a - b);
  const pct = (p) => sizes[Math.floor((sizes.length - 1) * p)];
  console.log(`${files.length} files -> ${total} chunks`);
  console.log(`chunk words: min ${sizes[0]}, median ${pct(0.5)}, 90% under ${pct(0.9)}, max ${sizes[sizes.length - 1]}`);
  const sample = chunkFile(await fs.readFile(files[0], "utf8")).chunks[0];
  console.log(`\nexample chunk from ${files[0]}:\n---\n${sample.embedText.slice(0, 600)}\n---`);
}

async function main() {
  const files = await listFiles();
  if (args.has("--dry")) return dryRun(files);

  const db = await connect();
  if (args.has("--reset")) {
    await db.query("DROP TABLE IF EXISTS chunks; DROP TABLE IF EXISTS documents;");
    console.log("--reset: dropped tables.");
  }
  await createTables(db);

  // what is already indexed
  const { rows } = await db.query("SELECT file, hash FROM documents");
  const indexed = new Map(rows.map((r) => [r.file, r.hash]));

  // files removed from data/ -> remove from the database
  const onDisk = new Set(files);
  const gone = [...indexed.keys()].filter((f) => !onDisk.has(f));
  if (gone.length) {
    await db.query("DELETE FROM documents WHERE file = ANY($1)", [gone]);
    console.log(`removed ${gone.length} deleted files`);
  }

  console.log(`Embedding model: ${EMBED_MODEL} (first run downloads it, ~130 MB)`);
  let done = 0, skipped = 0, chunkCount = 0;
  const started = Date.now();
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const hash = crypto.createHash("sha1").update(raw).digest("hex");
    if (indexed.get(file) === hash) { skipped++; continue; } // unchanged

    const { meta, chunks } = chunkFile(raw);
    if (!chunks.length) { console.log(`  skip ${file} (no text)`); continue; }
    const vectors = await embedPassages(chunks.map((c) => c.embedText));

    // replace this file's rows in one transaction
    await db.query("BEGIN");
    try {
      await db.query("DELETE FROM documents WHERE file = $1", [file]);
      await db.query(
        `INSERT INTO documents (file, hash, url, title, body, subject, type, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [file, hash, meta.source_url, meta.title, meta.body, meta.subject || meta.body, meta.type, meta.date || null],
      );
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        await db.query(
          `INSERT INTO chunks (file, chunk_index, heading, content, words, embedding)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [file, i, c.heading, c.content, c.words, toSql(vectors[i])],
        );
      }
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
    done++;
    chunkCount += chunks.length;
    if (done % 20 === 0) console.log(`  ${done} files indexed...`);
  }

  const { rows: [t] } = await db.query("SELECT count(*)::int AS docs, (SELECT count(*)::int FROM chunks) AS chunks FROM documents");
  console.log(`\nDone in ${Math.round((Date.now() - started) / 1000)}s: ${done} files indexed (${chunkCount} chunks), ${skipped} unchanged.`);
  console.log(`Database now has ${t.docs} files, ${t.chunks} chunks. Try: npm run search -- "how big is Mars"`);
  await db.end();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
