// Splits one Markdown file into chunks of ~300 words, cut at headings where possible.

export const TARGET_WORDS = 300;   // aim for this size
export const MAX_WORDS = 450;      // a section bigger than this gets split
export const MIN_WORDS = 40;       // a section smaller than this joins the next one
export const OVERLAP_WORDS = 50;   // words repeated between split pieces, so a fact cut in half isn't lost

const words = (s) => s.split(/\s+/).filter(Boolean);

// "---\nkey: value\n---\n# Title\n\ntext" -> { meta, text }
export function parseFile(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { meta: {}, text: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(": ");
    if (i > 0) meta[line.slice(0, i)] = line.slice(i + 2);
  }
  try { meta.title = JSON.parse(meta.title); } catch { /* plain string */ }
  // drop leftovers from the web page: empty bullets, "2 min read", lone brackets
  const text = m[2]
    .split("\n")
    .filter((l) => !/^\s*([*-]|\[|\]|\]\(.*\)|\d+\s+min\s+read)\s*$/i.test(l))
    .join("\n");
  return { meta, text };
}

// text -> [{ heading, text }], one per Markdown heading
function sections(text) {
  const out = [];
  let heading = "", buf = [];
  const flush = () => { const t = buf.join("\n").trim(); if (t) out.push({ heading, text: t }); buf = []; };
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) {
      flush();
      // the "# Title" line repeats the file title, so it doesn't become a heading
      heading = line.startsWith("# ") ? "" : h[1].trim();
    } else buf.push(line);
  }
  flush();
  return out;
}

// a long section -> pieces of ~TARGET_WORDS, cut between paragraphs, with overlap
function splitLong(text) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pieces = [];
  let cur = [];
  const curWords = () => words(cur.join(" ")).length;
  for (const p of paras) {
    // a single huge paragraph: cut it by words
    if (words(p).length > MAX_WORDS) {
      if (cur.length) { pieces.push(cur.join("\n\n")); cur = []; }
      const w = words(p);
      for (let i = 0; i < w.length; i += TARGET_WORDS - OVERLAP_WORDS) pieces.push(w.slice(i, i + TARGET_WORDS).join(" "));
      continue;
    }
    if (cur.length && curWords() + words(p).length > TARGET_WORDS) {
      pieces.push(cur.join("\n\n"));
      const tail = words(cur.join(" ")).slice(-OVERLAP_WORDS).join(" "); // overlap
      cur = [tail];
    }
    cur.push(p);
  }
  if (cur.length) pieces.push(cur.join("\n\n"));
  return pieces;
}

// whole file -> chunks ready to embed
export function chunkFile(raw) {
  const { meta, text } = parseFile(raw);
  const title = (meta.title || "").replace(/\s*[-|]\s*NASA( Science)?\s*$/i, "").trim();

  // join tiny sections into the next one so no chunk is just a heading and a line
  const merged = [];
  for (const s of sections(text)) {
    const prev = merged[merged.length - 1];
    if (prev && words(prev.text).length < MIN_WORDS) {
      prev.text += `\n\n${s.heading ? `${s.heading}: ` : ""}${s.text}`;
      if (!prev.heading) prev.heading = s.heading;
    } else merged.push({ ...s });
  }

  const chunks = [];
  for (const s of merged) {
    const pieces = words(s.text).length > MAX_WORDS ? splitLong(s.text) : [s.text];
    for (const content of pieces) {
      if (words(content).length < 15) continue; // leftovers like "2 min read"
      // what gets embedded: title + heading give context, e.g. "Mars Facts > Size and Distance"
      const label = [title, s.heading].filter(Boolean).join(" > ");
      chunks.push({ heading: s.heading, content, embedText: `${label}\n\n${content}`, words: words(content).length });
    }
  }
  return { meta: { ...meta, title }, chunks };
}
