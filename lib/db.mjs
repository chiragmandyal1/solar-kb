// Postgres + pgvector: one row per chunk.
import pg from "pg";
import { EMBED_DIMS } from "./embed.mjs";

export const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/solarkb";

export async function connect() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

export async function createTables(db) {
  await db.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    -- one row per source file; hash tells us if the file changed since last indexing
    CREATE TABLE IF NOT EXISTS documents (
      file        text PRIMARY KEY,
      hash        text NOT NULL,
      url         text,
      title       text,
      body        text,          -- planet the 3D view zooms to (mars, jupiter, ...)
      subject     text,          -- moon or mission name, else same as body
      type        text,          -- overview | facts | moon | mission | news
      date        date,
      indexed_at  timestamptz DEFAULT now()
    );

    -- one row per chunk; deleting a document deletes its chunks
    CREATE TABLE IF NOT EXISTS chunks (
      id          serial PRIMARY KEY,
      file        text NOT NULL REFERENCES documents(file) ON DELETE CASCADE,
      chunk_index int  NOT NULL,
      heading     text,
      content     text NOT NULL,
      words       int,
      embedding   vector(${EMBED_DIMS}) NOT NULL,
      -- for keyword search (exact names like "Perseverance" or "3I/ATLAS")
      tsv         tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading,'') || ' ' || content)) STORED
    );

    CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
    CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING gin (tsv);
    CREATE INDEX IF NOT EXISTS chunks_file_idx ON chunks (file);
  `);
}
