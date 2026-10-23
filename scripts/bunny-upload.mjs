// Uploads the heavy media in public/ to a bunny.net Storage Zone, same relative paths.
//   BUNNY_ZONE=<storage zone name> BUNNY_KEY=<zone password> [BUNNY_HOST=ny.storage.bunnycdn.com] \
//     node scripts/bunny-upload.mjs [--dry]
// BUNNY_HOST is the zone's regional endpoint (default storage.bunnycdn.com = Falkenstein/DE).
// Idempotent: PUT overwrites. Verifies each upload by size via a follow-up GET listing.
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const ZONE = process.env.BUNNY_ZONE, KEY = process.env.BUNNY_KEY;
const HOST = process.env.BUNNY_HOST || "storage.bunnycdn.com";
const DRY = process.argv.includes("--dry");
if (!DRY && (!ZONE || !KEY)) { console.error("Set BUNNY_ZONE and BUNNY_KEY (storage zone name + its password)."); process.exit(1); }

const ROOT = new URL("../public/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const INCLUDE = [
  /^dream\/hero\.(mp4|webm)$/,
  /^dream\/glass\/(station\d|trans-\d-\d)\.(mp4|webm)$/,
  /^dream\/glass\/mobile\/station\d\.(mp4|webm)$/,
  /^dream\/glass\/seq\/(ta|tb)\/\d+\.webp$/,
  /^work\/[a-z]+\/motion-[a-z-]+\.mp4$/,
];

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else yield p;
  }
}
const files = [];
for await (const p of walk(ROOT)) {
  const rel = relative(ROOT, p).split(sep).join("/");
  if (INCLUDE.some((re) => re.test(rel))) files.push({ p, rel, size: (await stat(p)).size });
}
files.sort((a, b) => a.rel.localeCompare(b.rel));
const total = files.reduce((n, f) => n + f.size, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB${DRY ? " (dry run)" : ""}`);
if (DRY) { files.forEach((f) => console.log(" ", f.rel)); process.exit(0); }

const base = `https://${HOST}/${encodeURIComponent(ZONE)}/`;
let done = 0, failed = 0;
async function put(f) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(base + f.rel.split("/").map(encodeURIComponent).join("/"), {
      method: "PUT",
      headers: { AccessKey: KEY, "Content-Type": "application/octet-stream" },
      body: await readFile(f.p),
    });
    if (res.status === 201 || res.status === 200) { done++; return; }
    if (res.status === 401) { console.error("401: wrong zone name/password, or wrong BUNNY_HOST region."); process.exit(2); }
    if (attempt === 3) { failed++; console.error(`FAIL ${f.rel}: ${res.status} ${await res.text()}`); }
  }
}
const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => { for (let f; (f = queue.shift()); ) { await put(f); if (done % 10 === 0) console.log(`  ${done}/${files.length}`); } }));
console.log(`uploaded ${done}, failed ${failed}`);
process.exit(failed ? 3 : 0);
