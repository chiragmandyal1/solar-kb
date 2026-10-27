// Downloads NASA solar system knowledge as clean Markdown files:
//   1. planet pages (overview + facts)   2. moon pages   3. mission pages   4. NASA news
// Output: data/<planet>/<slug>.md, each with a header (title, source_url, body, subject, type, date).
//
// Run:   npm run download              keeps existing files, only downloads what is missing
//        npm run download -- --fresh   deletes data/ and downloads everything again
//        npm run download -- --no-news skips the slow news part
// Pages whose text can't be extracted are saved to debug/ so the extractor can be fixed.

import fs from "node:fs/promises";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { XMLParser } from "fast-xml-parser";

// ----------------- Config -----------------
const OUT_DIR = "data";
const DEBUG_DIR = "debug";
const DELAY_MS = 1000;          // be polite: 1 request per second
const NEWS_DAYS = 730;          // keep news from the last 2 years
const MAX_NEWS = 300;           // total news cap (existing files count)
const MAX_PER_BODY = 30;        // max news per planet, so Moon/Mars don't crowd out the rest
const MAX_MOONS = 120;
const MAX_MISSIONS = 150;
const MIN_WORDS = 150;          // news/mission pages shorter than this are skipped
const MIN_MOON_WORDS = 60;      // small moons have short pages
const MAX_FEED_PAGES = 800;     // how far back to page through each feed
const IDLE_FEED_PAGES = 150;    // give up on a feed after this many pages with nothing new
const UA = "solar-kb/1.0 (personal learning project)";

// not about our solar system, or not useful text
const SKIP_URL = [
  "/exoplanet-catalog/", "/exoplanets/", "/photojournal/galleries/", "/gallery/", "/people/",
  "/earth-observatory/", "/learning-resources/", "/mission/sage/", "/roman-space-telescope/",
  "/missions/tess/", "/mission/webb/", "/mission/hubble/", "/mission/chandra/", "landsat",
  "/news-release/nasa-invites-media",
];
const SKIP_TITLE = /\b(poster|activity|activities|role[\s-]play|space[\s-]math|hby|math[\s-]\d+|planetarium[\s-]show|community[\s-]meeting|gallery|multimedia|publications|scale[\s-]model|3d[\s-]print|participatory[\s-]science[\s-]film|experiment[\s-]albedo|seminar|release[\s-]notes)\b/i;
// pages checked by hand and rejected (wrong planet / not about a planet)
const BLOCKLIST = [
  "the-view-from-above-the-gemini-visual-acuity-experiments",
  "perseids-from-perseus", "buck-moon-and-belt-of-venus",
  "psyche-heads-toward-asteroid", "make-beer-bubbly", "star-formation",
  "jupiters-around-other-suns", "65-year-legacy-of-human-spaceflight",
  "northwest-earth-and-space-science", "white-dwarf-eating", "space-weather-living-history",
  "moon-like-madagascar", "jpl-3d-printed-part",
  "peter-d-ward", "/resource/", "multi-messenger", "time-domain", "space-reactors-division",
  "applications-for-next-class", "rocket-evolution", "corona-australis", "/earth-science/",
];
// sections at the end of NASA pages that are just links/sharing, cut from here down
const TAIL = /^(#+\s*)?(Keep Exploring|Explore More|Share|Details|Related Terms|Discover More Topics.*)\s*$/m;

// body id -> page paths on science.nasa.gov (overview + facts)
const BODIES = {
  sun: ["/sun/", "/sun/facts/"],
  mercury: ["/mercury/", "/mercury/facts/"],
  venus: ["/venus/", "/venus/facts/"],
  earth: ["/earth/", "/earth/facts/"],
  moon: ["/moon/", "/moon/facts/"],
  mars: ["/mars/", "/mars/facts/"],
  jupiter: ["/jupiter/", "/jupiter/facts/"],
  saturn: ["/saturn/", "/saturn/facts/"],
  uranus: ["/uranus/", "/uranus/facts/"],
  neptune: ["/neptune/", "/neptune/facts/"],
  pluto: ["/dwarf-planets/pluto/", "/dwarf-planets/pluto/facts/"],
  ceres: ["/dwarf-planets/ceres/", "/dwarf-planets/ceres/facts/"],
};
// moon index pages (each lists that planet's moons)
const MOON_INDEX = {
  mars: "/mars/moons/", jupiter: "/jupiter/moons/", saturn: "/saturn/moons/",
  uranus: "/uranus/moons/", neptune: "/neptune/moons/", pluto: "/dwarf-planets/pluto/moons/",
};
// big moons we must have even if the index pages don't link them: [planet, moon, candidate paths]
const MOON_SEEDS = [
  ["jupiter", "io", ["/jupiter/jupiter-moons/io/", "/jupiter/moons/io/"]],
  ["jupiter", "europa", ["/jupiter/jupiter-moons/europa/", "/jupiter/moons/europa/"]],
  ["jupiter", "ganymede", ["/jupiter/jupiter-moons/ganymede/", "/jupiter/moons/ganymede/"]],
  ["jupiter", "callisto", ["/jupiter/jupiter-moons/callisto/", "/jupiter/moons/callisto/"]],
  ["saturn", "titan", ["/saturn/moons/titan/", "/saturn/moons/titan/facts/"]],
];
const SITE = "https://science.nasa.gov";
const FEEDS = ["https://science.nasa.gov/feed/", "https://www.nasa.gov/feed/"];
const MOON_LINK = /^\/(?:dwarf-planets\/)?(mars|jupiter|saturn|uranus|neptune|pluto)\/(?:moons|[a-z]+-moons)\/([a-z0-9-]+)\/$/;
const MISSION_LINK = /^\/mission\/([a-z0-9-]+)\/$/;
// ------------------------------------------

const args = new Set(process.argv.slice(2));
const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndown.remove(["script", "style", "noscript", "iframe", "form", "button", "nav", "header", "footer", "aside"]);
const quietConsole = new VirtualConsole(); // hide jsdom CSS warnings
const failures = [];
const have = new Map();         // source_url -> { body, type } for files already on disk
const moonLinks = new Map();    // url -> { body, subject }
const missionLinks = new Set(); // url
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;
let fetched = 0;

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function cleanMd(md) {
  const cut = md.search(TAIL);
  if (cut > 0) md = md.slice(0, cut);
  return md.replace(/!\[[^\]]*\]\([^)]*\)/g, "")   // drop images
    .replace(/^\[\s*\]\([^)]*\)\s*$/gm, "")          // drop empty links left by images
    .replace(/\n{3,}/g, "\n\n").trim();
}

// HTML page -> { title, markdown }. Tries Readability first; if that finds little,
// falls back to the page's <main> element (NASA hub pages confuse Readability).
export function htmlToMarkdown(html, url) {
  const doc = () => new JSDOM(html, { url, virtualConsole: quietConsole }).window.document;
  let title = "", best = "";
  const article = new Readability(doc()).parse();
  if (article?.content) { best = cleanMd(turndown.turndown(article.content)); title = article.title || ""; }
  const d = doc();
  const main = d.querySelector("main") || d.querySelector("#main-content") || d.querySelector("article");
  if (main) {
    const md = cleanMd(turndown.turndown(main.innerHTML));
    if (wordCount(md) > wordCount(best) * 1.5) best = md;
  }
  if (!title) title = d.querySelector("h1")?.textContent || d.title || "";
  title = title.replace(/\s+/g, " ").trim();
  return best ? { title, markdown: best } : null;
}

// Collect moon and mission links from a page (before menus are stripped)
export function collectLinks(html, url) {
  const doc = new JSDOM(html, { url, virtualConsole: quietConsole }).window.document;
  for (const a of doc.querySelectorAll("a[href]")) {
    let u;
    try { u = new URL(a.href, url); } catch { continue; }
    if (u.host !== "science.nasa.gov") continue;
    const p = u.pathname.endsWith("/") ? u.pathname : u.pathname + "/";
    const moon = p.match(MOON_LINK);
    if (moon && moon[2] !== "facts") moonLinks.set(SITE + p, { body: moon[1], subject: moon[2] });
    if (MISSION_LINK.test(p)) missionLinks.add(SITE + p);
  }
}

const skipped = (url, title = "") =>
  SKIP_URL.some((x) => url.includes(x)) || BLOCKLIST.some((x) => url.includes(x)) || SKIP_TITLE.test(title);

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "page";
}

async function save({ body, subject, type, url, title, date, markdown }) {
  const dir = path.join(OUT_DIR, body);
  await fs.mkdir(dir, { recursive: true });
  const slug = type === "news" ? `news-${slugify(title)}` : slugify(new URL(url).pathname);
  const file = path.join(dir, `${slug}.md`);
  const header = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source_url: ${url}`,
    `body: ${body}`,
    `subject: ${subject || body}`,
    `type: ${type}`,
    `date: ${date || ""}`,
    `fetched_at: ${new Date().toISOString()}`,
    "---",
    "",
  ].join("\n");
  await fs.writeFile(file, `${header}# ${title}\n\n${markdown}\n`, "utf8");
  have.set(url, { body, type });
  fetched++;
  return file;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function saveDebug(url, html) {
  await fs.mkdir(DEBUG_DIR, { recursive: true });
  await fs.writeFile(path.join(DEBUG_DIR, slugify(new URL(url).pathname) + ".html"), html);
}

// Read headers of files already on disk, so we can skip them and rebuild the manifest
async function scanExisting() {
  const files = [];
  if (!(await exists(OUT_DIR))) return files;
  for (const dir of await fs.readdir(OUT_DIR)) {
    const full = path.join(OUT_DIR, dir);
    if (!(await fs.stat(full)).isDirectory()) continue;
    for (const f of await fs.readdir(full)) {
      if (!f.endsWith(".md")) continue;
      const file = path.join(full, f);
      const text = await fs.readFile(file, "utf8");
      const h = Object.fromEntries([...text.matchAll(/^(\w+): (.*)$/gm)].slice(0, 8).map((m) => [m[1], m[2]]));
      const body = text.split(/^---$/m).slice(2).join("---");
      files.push({ file, body: h.body, subject: h.subject || h.body, type: h.type, title: JSON.parse(h.title || '""'), url: h.source_url, date: h.date, words: wordCount(body) });
    }
  }
  return files;
}

// Fetch one page, convert, save. Returns true if saved (or already had it).
async function fetchAndSave(url, info, { collect = false, minWords = MIN_WORDS } = {}) {
  if (have.has(url) && !collect) return true;
  try {
    const html = await get(url);
    if (collect) collectLinks(html, url);
    if (have.has(url)) return true; // only needed the links
    const page = htmlToMarkdown(html, url);
    if (!page || wordCount(page.markdown) < minWords) {
      await saveDebug(url, html);
      throw new Error(`too little text (${page ? wordCount(page.markdown) : 0} words), saved to debug/`);
    }
    if (skipped(url, page.title)) return false;
    const body = typeof info.body === "function" ? info.body(page.markdown) : info.body;
    if (!body) return false; // not about any solar system body
    const file = await save({ ...info, body, url, title: page.title, markdown: page.markdown });
    console.log(`  ok   ${file}`);
    return true;
  } catch (e) {
    console.log(`  FAIL ${url} (${e.message})`);
    failures.push({ url, error: e.message });
    return false;
  } finally {
    await sleep(DELAY_MS);
  }
}

// ---------- 1. Planet / body pages ----------
async function downloadBodies() {
  console.log("== 1. Planet pages ==");
  for (const [body, paths] of Object.entries(BODIES)) {
    for (const p of paths) {
      const type = p.endsWith("/facts/") ? "facts" : "overview";
      // always fetched: they are where moon and mission links are found
      await fetchAndSave(SITE + p, { body, type }, { collect: true, minWords: 50 });
    }
  }
}

// ---------- 2. Moon pages ----------
async function downloadMoons() {
  console.log("\n== 2. Moon pages ==");
  for (const p of Object.values(MOON_INDEX)) {
    try { collectLinks(await get(SITE + p), SITE + p); }
    catch (e) { console.log(`  FAIL ${SITE + p} (${e.message})`); failures.push({ url: SITE + p, error: e.message }); }
    await sleep(DELAY_MS);
  }
  console.log(`  found ${moonLinks.size} moon links`);
  let n = [...have.values()].filter((h) => h.type === "moon").length;
  for (const [url, { body, subject }] of moonLinks) {
    if (n >= MAX_MOONS) break;
    if (have.has(url) || skipped(url)) continue;
    if (await fetchAndSave(url, { body, subject, type: "moon" }, { collect: true, minWords: MIN_MOON_WORDS })) n++;
  }
  // big moons: try each candidate path until one works
  for (const [body, subject, paths] of MOON_SEEDS) {
    const urls = paths.map((p) => SITE + p);
    if (urls.some((u) => have.has(u))) continue;
    for (const url of urls) {
      if (await fetchAndSave(url, { body, subject, type: "moon" }, { minWords: MIN_MOON_WORDS })) break;
    }
  }
}

// ---------- 3. Mission pages ----------
async function downloadMissions() {
  console.log(`\n== 3. Mission pages (found ${missionLinks.size} links) ==`);
  let n = [...have.values()].filter((h) => h.type === "mission").length;
  for (const url of missionLinks) {
    if (n >= MAX_MISSIONS) break;
    if (have.has(url) || skipped(url)) continue;
    const subject = url.split("/mission/")[1].replace(/\/$/, "");
    if (await fetchAndSave(url, { body: pickBody, subject, type: "mission" })) n++;
  }
}

// ---------- 4. News ----------
// Tag an article with the body it mentions most; skip it if it mentions none,
// or if it is mostly about exoplanets/stars.
export function pickBody(text) {
  if ((text.match(/\bexoplanets?\b/gi) || []).length >= 3) return null;
  const names = {
    sun: /\b(the sun|solar flare|solar wind|sunspot|corona)\b/gi,
    mercury: /(?<!-)\b(planet mercury|mercury's|messenger|bepicolombo)\b/gi, venus: /\bvenus\b/gi, earth: /\bearth's\b/gi,
    moon: /\b(the moon|lunar|artemis)\b/gi, mars: /\b(mars|martian)\b/gi,
    jupiter: /\b(jupiter|europa|juno|ganymede|callisto)\b/gi, saturn: /\b(saturn|titan|enceladus)\b/gi,
    uranus: /\buranus\b/gi, neptune: /\b(neptune|triton)\b/gi,
    pluto: /\bpluto\b/gi, ceres: /\bceres\b/gi,
  };
  let best = null, bestCount = 0;
  for (const [body, re] of Object.entries(names)) {
    const n = (text.match(re) || []).length;
    if (n > bestCount) { best = body; bestCount = n; }
  }
  return bestCount >= 2 ? best : null; // needs at least 2 mentions to count
}

async function downloadNews() {
  console.log("\n== 4. News ==");
  const xml = new XMLParser();
  const cutoff = Date.now() - NEWS_DAYS * 24 * 3600 * 1000;
  const seen = new Set();
  const perBody = {};
  let saved = 0;
  for (const h of have.values()) if (h.type === "news") { perBody[h.body] = (perBody[h.body] || 0) + 1; saved++; }
  console.log(`  already have ${saved} news`);

  for (const feed of FEEDS) {
    let idle = 0;
    for (let page = 1; page <= MAX_FEED_PAGES && saved < MAX_NEWS && idle < IDLE_FEED_PAGES; page++) {
      const feedUrl = page === 1 ? feed : `${feed}?paged=${page}`;
      let items;
      try {
        const data = xml.parse(await get(feedUrl));
        items = [].concat(data?.rss?.channel?.item || []);
      } catch (e) {
        if (page === 1) { console.log(`  FAIL feed ${feedUrl} (${e.message})`); failures.push({ url: feedUrl, error: e.message }); }
        break; // no more pages
      }
      if (!items.length) break;
      if (page % 25 === 0) console.log(`  ...${new URL(feed).host} page ${page}, ${saved} news total`);

      let olderThanCutoff = 0, newHere = 0;
      for (const item of items) {
        if (saved >= MAX_NEWS) break;
        const url = item.link;
        const date = new Date(item.pubDate);
        if (!url || seen.has(url) || have.has(url) || skipped(url, String(item.title))) continue;
        seen.add(url);
        if (date.getTime() < cutoff) { olderThanCutoff++; continue; }

        const quick = `${item.title} ${item.description || ""}`;
        const guess = pickBody(quick + " " + quick); // cheap filter before downloading
        if (!guess || (perBody[guess] || 0) >= MAX_PER_BODY) continue;

        try {
          const art = htmlToMarkdown(await get(url), url);
          await sleep(DELAY_MS);
          if (!art || wordCount(art.markdown) < MIN_WORDS || skipped(url, art.title)) continue;
          const body = pickBody(art.markdown);
          if (!body || (perBody[body] || 0) >= MAX_PER_BODY) continue;
          perBody[body] = (perBody[body] || 0) + 1;
          const file = await save({
            body, type: "news", url, title: art.title || String(item.title),
            date: date.toISOString().slice(0, 10), markdown: art.markdown,
          });
          saved++; newHere++;
          console.log(`  ok   ${file}`);
        } catch (e) {
          console.log(`  FAIL ${url} (${e.message})`);
          failures.push({ url, error: e.message });
        }
      }
      idle = newHere ? 0 : idle + 1;
      if (olderThanCutoff === items.length) break; // whole page too old
      await sleep(DELAY_MS);
    }
  }
}

async function main() {
  if (args.has("--fresh") && (await exists(OUT_DIR))) {
    console.log("--fresh: deleting data/ folder.\n");
    await fs.rm(OUT_DIR, { recursive: true, force: true });
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const f of await scanExisting()) have.set(f.url, { body: f.body, type: f.type });
  console.log(`Keeping ${have.size} existing files; only missing ones are downloaded.\n`);

  await downloadBodies();
  await downloadMoons();
  await downloadMissions();
  if (!args.has("--no-news")) await downloadNews();

  const manifest = await scanExisting(); // everything on disk, old + new
  await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify({ files: manifest, failures }, null, 2));
  const words = manifest.reduce((s, m) => s + m.words, 0);
  const byType = manifest.reduce((o, m) => ((o[m.type] = (o[m.type] || 0) + 1), o), {});
  console.log(`\nDone: ${fetched} new files this run. Total ${manifest.length} files, ~${words.toLocaleString()} words, ${failures.length} failures.`);
  console.log(`By type: ${JSON.stringify(byType)}`);
  if (failures.length) console.log(`Pages with too little text were saved to ${DEBUG_DIR}/ — share them to fix the extractor.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
