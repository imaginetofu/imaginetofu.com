/* Imagine TOFU v3 — service windows drawn in code.
   Each .it-tile-scene carries a still (and, when present, a small loop).
   This module samples that source on a coarse grid and redraws it live
   as ASCII characters or a pixel mosaic in the brand palette, so the
   services read as a different material from the After Dark video.

   data-art on .it-tiles (or a single .it-tile): "ascii" | "pixel".
   Sources stay in the DOM (the <video> keeps playing, hidden) and are
   only ever read, never shown, once the canvas is live.

   The motion tile also gets a crisp pixel-art tofu drawn over the mosaic
   (its cube melts into the trail otherwise) and a cursor light trail.

   Tiles autoplay while in view; the motion tile adds a cursor trail on hover.
   Reduced motion: one static frame, no ticker, no cursor trail. */

const TOKENS = {
  ground: [15, 24, 20],
  mint: [158, 217, 191],
  peach: [243, 181, 156],
  cream: [241, 234, 217],
};

// mixes of tokens only (the brand's color-mix rule, done by hand in RGB)
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

// luminance ramp → palette steps. Cool pixels climb ground→mint→cream,
// warm pixels climb ground→peach→cream, so the stills' own peach glow
// survives the translation.
const COOL = [
  mix(TOKENS.ground, TOKENS.mint, 0.22),
  mix(TOKENS.ground, TOKENS.mint, 0.42),
  mix(TOKENS.ground, TOKENS.mint, 0.7),
  TOKENS.mint,
  mix(TOKENS.mint, TOKENS.cream, 0.55),
  TOKENS.cream,
];
const WARM = [
  mix(TOKENS.ground, TOKENS.peach, 0.22),
  mix(TOKENS.ground, TOKENS.peach, 0.42),
  mix(TOKENS.ground, TOKENS.peach, 0.7),
  TOKENS.peach,
  mix(TOKENS.peach, TOKENS.cream, 0.55),
  TOKENS.cream,
];
// ascii density ramp (one glyph per palette step; index 0 = darkest drawn)
const GLYPHS = ["·", ":", "+", "*", "#", "@"];

import { LITE } from "./perf.js";

export function initTileArt({ reduced = false } = {}) {
  const tiles = [...document.querySelectorAll(".it-tile")];
  if (!tiles.length) return;
  const dpr = Math.min(devicePixelRatio || 1, LITE ? 1.5 : 2);   // phones: 1.5x, the cells are 5-9px blocks
  const renders = [];

  tiles.forEach((tile) => {
    const scene = tile.querySelector(".it-tile-scene");
    const img = scene?.querySelector("img");
    if (!scene || !img) return;
    const video = LITE ? null : scene.querySelector("video");   // phones animate from the still: no loop to fetch or decode
    const mode = tile.dataset.art || tile.closest("[data-art]")?.dataset.art || "ascii";
    const canvas = document.createElement("canvas");
    canvas.className = "it-tile-art";
    // below the aura (screen-blended colour drift) and the veil
    scene.insertBefore(canvas, scene.querySelector(".it-tile-aura"));
    const ctx = canvas.getContext("2d", { alpha: true });
    const samp = document.createElement("canvas");
    const sctx = samp.getContext("2d", { willReadFrequently: true });

    const R = {
      tile, scene, img, video, canvas, ctx, samp, sctx, mode,
      cell: mode === "pixel" ? 5.5 : 9,
      gamma: mode === "pixel" ? 0.8 : 0.62,
      floor: mode === "pixel" ? 0.3 : 0.14,
      cols: 0, rows: 0, w: 0, h: 0,
      atlas: null, atlasCell: 0,
      visible: false, ready: false,
      pos: [0.5, 0.42],
      t0: performance.now(),
      lastFrame: 0,
      fx: tile.classList.contains("it-tile--motion") ? "tofu" : null,
      trail: [], bob: [0, 0], ref: null,
    };
    if (R.fx === "tofu" && !reduced) {
      // the cursor leaves its own light trail, like the tofu's
      scene.closest(".it-tile").addEventListener("pointermove", (e) => {
        const b = R.scene.getBoundingClientRect();
        const x = e.clientX - b.left, y = e.clientY - b.top, t = performance.now();
        const last = R.trail[R.trail.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) < 4) return;
        R.trail.push({ x, y, t });
        if (R.trail.length > 60) R.trail.shift();
      }, { passive: true });
    }
    const op = getComputedStyle(img).objectPosition.split(" ");
    if (op.length === 2) R.pos = op.map((v) => parseFloat(v) / 100 || 0.5);
    renders.push(R);

    const onReady = () => {
      R.ready = true;
      tile.classList.add("is-art");
      layout(R, dpr);
      draw(R, performance.now(), true);
    };
    if (img.complete && img.naturalWidth) onReady();
    else img.addEventListener("load", onReady, { once: true });
  });

  // width changes only: phone URL-bar collapses fire resize with the same width, and re-laying out three canvases + atlases on each is a hitch
  let lastW = innerWidth;
  const relayout = () => renders.forEach((R) => R.ready && (layout(R, dpr), draw(R, performance.now(), true)));
  addEventListener("resize", () => { if (innerWidth !== lastW) { lastW = innerWidth; relayout(); } }, { passive: true });
  document.fonts?.ready?.then(relayout); // glyph atlas needs the real Space Mono

  if (reduced) return; // one still frame each, drawn above

  // warm-up: fetch the (tiny) loops two screens before the section so they
  // are decoded and ready the moment the windows come into view. Markup
  // says preload="none" so nothing competes with the hero on first paint.
  const warm = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const R = renders.find((r) => r.tile === e.target);
        warm.unobserve(e.target);
        if (R?.video && R.video.preload === "none") {
          R.video.preload = "auto";
          R.video.load();
        }
      }),
    { rootMargin: "200% 0px" }
  );
  renders.forEach((R) => warm.observe(R.tile));

  // play/pause with visibility; only visible tiles tick (autoplay)
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        const R = renders.find((r) => r.tile === e.target);
        if (!R) return;
        R.visible = e.isIntersecting;
        if (R.visible) kick?.();
        if (R.video) {
          if (R.visible) R.video.play?.().catch(() => {});
          else R.video.pause?.();
        }
      }),
    { rootMargin: "120px 0px" }
  );
  renders.forEach((R) => io.observe(R.tile));

  const FRAME = 1000 / 20; // 20 fps is plenty for a 9px grid
  // phones: the mosaic is a few thousand cell draws + a pixel readback, on the main thread. So only the
  // window nearest the middle of the screen animates (12 fps), and only while the scroll is at rest —
  // a frozen frame during a flick is invisible, a dropped scroll frame is not.
  let lastScroll = 0, running = true;
  // phones: the loop itself sleeps while no window is near the screen; the observer above wakes it
  var kick = () => { if (!running) { running = true; requestAnimationFrame(tick); } };
  if (LITE) addEventListener("scroll", () => { lastScroll = performance.now(); }, { passive: true });
  const tick = (now) => {
    if (LITE) {
      if (now - lastScroll > 160) {
        let best = null, bd = Infinity;
        renders.forEach((R) => {
          if (!R.ready || !R.visible) return;
          const b = R.tile.getBoundingClientRect();
          const d = Math.abs(b.top + b.height / 2 - innerHeight / 2);
          if (d < bd && b.bottom > 0 && b.top < innerHeight) { bd = d; best = R; }
        });
        if (best && now - best.lastFrame >= 1000 / 12) { best.lastFrame = now; draw(best, now, false); }
      }
      if (!renders.some((R) => R.visible)) { running = false; return; }
      requestAnimationFrame(tick);
      return;
    }
    renders.forEach((R) => {
      if (!R.ready || !R.visible) return;
      if (now - R.lastFrame < (R.fx ? 1000 / 30 : FRAME)) return;
      R.lastFrame = now;
      draw(R, now, false);
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function layout(R, dpr) {
  const box = R.scene.getBoundingClientRect();
  R.w = Math.max(1, Math.round(box.width));
  R.h = Math.max(1, Math.round(box.height));
  R.canvas.width = Math.round(R.w * dpr);
  R.canvas.height = Math.round(R.h * dpr);
  R.canvas.style.width = R.w + "px";
  R.canvas.style.height = R.h + "px";
  R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // scale the cell with the tile so the character count stays similar
  R.cellPx = R.cell * Math.max(0.8, Math.min(1.35, R.w / 430));
  R.cols = Math.ceil(R.w / R.cellPx);
  R.rows = Math.ceil(R.h / R.cellPx);
  R.samp.width = R.cols;
  R.samp.height = R.rows;
  if (R.mode === "ascii") buildAtlas(R, dpr);
}

// glyph atlas: every glyph in every palette colour, drawn once
function buildAtlas(R, dpr) {
  const size = Math.ceil(R.cellPx * dpr);
  const palettes = [COOL, WARM];
  const atlas = document.createElement("canvas");
  atlas.width = size * GLYPHS.length;
  atlas.height = size * palettes.length * COOL.length;
  const a = atlas.getContext("2d");
  a.font = `${Math.round(R.cellPx * 1.25 * dpr)}px "Space Mono", ui-monospace, monospace`;
  a.textAlign = "center";
  a.textBaseline = "middle";
  palettes.forEach((pal, p) =>
    pal.forEach((col, s) => {
      a.fillStyle = rgb(col);
      GLYPHS.forEach((g, gi) => a.fillText(g, gi * size + size / 2, (p * COOL.length + s) * size + size / 2 + size * 0.04));
    })
  );
  R.atlas = atlas;
  R.atlasCell = size;
}

function draw(R, now, still) {
  const src = R.video && R.video.readyState >= 2 && !R.video.paused ? R.video : R.img;
  const sw = src.videoWidth || src.naturalWidth;
  const sh = src.videoHeight || src.naturalHeight;
  if (!sw || !sh) return;
  // object-fit: cover, honouring object-position
  const scale = Math.max(R.cols / sw, R.rows / sh);
  const cw = R.cols / scale;
  const ch = R.rows / scale;
  const sx = (sw - cw) * R.pos[0];
  const sy = (sh - ch) * R.pos[1];
  R.sctx.drawImage(src, sx, sy, cw, ch, 0, 0, R.cols, R.rows);
  const data = R.sctx.getImageData(0, 0, R.cols, R.rows).data;

  const ctx = R.ctx;
  ctx.clearRect(0, 0, R.w, R.h);
  const t = (now - R.t0) / 1000;
  const fromStill = src === R.img;
  // when the source is a still, let the picture breathe: a slow noise
  // ripple on the luminance and a light that sweeps through every ~9s
  const sweep = ((t % 9) / 9) * 1.6 - 0.3;
  const cp = R.cellPx;
  const dpr = R.canvas.width / R.w;
  const gap = R.mode === "pixel" ? 1 : 0;

  for (let y = 0; y < R.rows; y++) {
    for (let x = 0; x < R.cols; x++) {
      const i = (y * R.cols + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // lift the shadows: the stills live mostly below mid-grey, and a
      // character grid needs the quiet detail to read at all
      let L = Math.pow((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, R.gamma);
      if (fromStill && !still) {
        const nx = x / R.cols, ny = y / R.rows;
        L += 0.045 * Math.sin(nx * 7 + t * 0.9) * Math.sin(ny * 5 - t * 0.6);
        const d = nx * 0.6 + ny * 0.4 - sweep;
        L += 0.09 * Math.exp(-(d * d) / 0.012);
      }
      if (L < R.floor) continue; // ground stays ground
      const warm = r - b > 26 && r > g; // the stills' peach glow
      const pal = warm ? WARM : COOL;
      const step = Math.min(pal.length - 1, Math.floor(((L - R.floor) / (1 - R.floor)) * pal.length));
      if (R.mode === "pixel") {
        ctx.fillStyle = rgb(pal[step]);
        ctx.fillRect(x * cp, y * cp, cp - gap, cp - gap);
      } else {
        const p = warm ? 1 : 0;
        ctx.drawImage(
          R.atlas,
          step * R.atlasCell, (p * COOL.length + step) * R.atlasCell, R.atlasCell, R.atlasCell,
          x * cp, y * cp, cp, cp
        );
      }
    }
  }
  if (R.fx === "tofu") {
    if (!still) drawTrail(R, now);
    drawTofu(R, data, sw, sh, sx, sy, cw, ch, still);
  }
}

/* ---------- the motion tile: a crisp pixel tofu over the mosaic ----------
   The loop's cube melts into its own light trail at mosaic resolution, so a
   pixel-art cube is drawn over it: dark one-cell halo, cream silhouette,
   the three inner edges, lightly lit faces and the little face. Points are
   in the source's pixels (300x400), measured off the poster; the cube's bob
   in the video is tracked from the mosaic's own brightness. */
const TOFU = {
  sil: [[196.25, 45], [221.25, 37.5], [260, 52], [253.75, 95], [228.75, 106.25], [187.5, 98], [190, 67.5]],
  c: [242.5, 73.75],
  top: [[196.25, 45], [221.25, 37.5], [260, 52], [242.5, 73.75], [190, 67.5]],
  front: [[190, 67.5], [242.5, 73.75], [228.75, 106.25], [187.5, 98]],
  right: [[242.5, 73.75], [260, 52], [253.75, 95], [228.75, 106.25]],
  eyes: [[202.5, 72.5], [221.5, 79]],
  smile: [211, 81],
  box: [180, 30, 268, 112], // tracking window
  W: 300, H: 400,
};

function cellLine(x0, y0, x1, y1, plot) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), stx = x0 < x1 ? 1 : -1, sty = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += stx; }
    if (e2 <= dx) { err += dx; y0 += sty; }
  }
}
const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

function drawTofu(R, data, sw, sh, sx, sy, cw, ch, still) {
  const kx = sw / TOFU.W, ky = sh / TOFU.H;
  const toCell = ([u, v]) => [((u * kx - sx) / cw) * R.cols, ((v * ky - sy) / ch) * R.rows];
  // track the bob: brightness-weighted centroid inside the cube's window
  const [bx0, by0] = toCell([TOFU.box[0], TOFU.box[1]]), [bx1, by1] = toCell([TOFU.box[2], TOFU.box[3]]);
  let wsum = 0, mx = 0, my = 0;
  for (let y = Math.max(0, Math.floor(by0)); y < Math.min(R.rows, Math.ceil(by1)); y++)
    for (let x = Math.max(0, Math.floor(bx0)); x < Math.min(R.cols, Math.ceil(bx1)); x++) {
      const i = (y * R.cols + x) * 4, l = (data[i] + data[i + 1] + data[i + 2]) / 765, w = l * l * l;
      wsum += w; mx += w * x; my += w * y;
    }
  if (wsum > 0) {
    const c = [mx / wsum, my / wsum];
    if (!R.ref || still) R.ref = c;
    const k = 0.18;
    R.bob[0] += (Math.max(-1.5, Math.min(1.5, c[0] - R.ref[0])) - R.bob[0]) * k;
    R.bob[1] += (Math.max(-1.5, Math.min(1.5, c[1] - R.ref[1])) - R.bob[1]) * k;
  }
  const P = (pt) => { const [x, y] = toCell(pt); return [x + R.bob[0], y + R.bob[1]]; };
  const ctx = R.ctx, cp = R.cellPx, gap = 1;
  const cell = (x, y, col, a = 1) => {
    if (x < 0 || y < 0 || x >= R.cols || y >= R.rows) return;
    ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(x * cp, y * cp, cp - gap, cp - gap);
  };
  // lit faces (soft, so the mosaic still shows through)
  const faces = [[TOFU.top, rgb(TOKENS.cream), 0.55], [TOFU.front, rgb(mix(TOKENS.mint, TOKENS.cream, 0.25)), 0.5], [TOFU.right, rgb(mix(TOKENS.peach, TOKENS.ground, 0.12)), 0.62]];
  const sil = TOFU.sil.map(P);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  sil.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  for (const [poly, col, a] of faces) {
    const pp = poly.map(P);
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++)
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++)
        if (inPoly(x + 0.5, y + 0.5, pp)) cell(x, y, col, a);
  }
  // halo: ground ring just outside the silhouette
  const ground = rgb(TOKENS.ground), cream = rgb(TOKENS.cream);
  const ring = new Set();
  for (let i = 0; i < sil.length; i++) {
    const a = sil[i], b = sil[(i + 1) % sil.length];
    cellLine(a[0], a[1], b[0], b[1], (x, y) => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const qx = x + ox, qy = y + oy;
        if (!inPoly(qx + 0.5, qy + 0.5, sil)) ring.add(qx + "," + qy);
      }
    });
  }
  ring.forEach((k) => { const [x, y] = k.split(",").map(Number); cell(x, y, ground, 0.92); });
  // silhouette + inner edges
  const edge = (a, b, col, al) => cellLine(a[0], a[1], b[0], b[1], (x, y) => cell(x, y, col, al));
  // pixel-art inking: dark outline, darker seams, one cream highlight edge
  const ink = rgb(mix(TOKENS.ground, TOKENS.mint, 0.18));
  for (let i = 0; i < sil.length; i++) edge(sil[i], sil[(i + 1) % sil.length], ink, 1);
  const c = P(TOFU.c);
  const seam = rgb(mix(TOKENS.ground, TOKENS.mint, 0.45));
  [TOFU.sil[2], TOFU.sil[4], TOFU.sil[6]].forEach((pt) => edge(c, P(pt), seam, 0.95));
  // highlight just inside the top-left edges (light from the upper left)
  const hl = (a, b) => { const A = P(a), B = P(b); edge([A[0] + 0.9, A[1] + 1], [B[0] + 0.4, B[1] + 1], cream, 0.9); };
  hl(TOFU.sil[0], TOFU.sil[1]); hl(TOFU.sil[6], TOFU.sil[0]);
  // the face: ^ ^ and a small smile
  const dark = rgb(mix(TOKENS.ground, TOKENS.peach, 0.12));
  TOFU.eyes.forEach((e) => {
    const [ex, ey] = P(e).map(Math.round);
    cell(ex - 1, ey, dark, 0.95); cell(ex, ey - 1, dark, 0.95); cell(ex + 1, ey, dark, 0.95);
  });
  const [mx2, my2] = P(TOFU.smile).map(Math.round);
  cell(mx2 - 1, my2, dark, 0.9); cell(mx2, my2 + 1, dark, 0.9); cell(mx2 + 1, my2, dark, 0.9);
  // blush
  TOFU.eyes.forEach((e, i) => { const [ex, ey] = P(e).map(Math.round); cell(ex + (i ? 1 : -1), ey + 2, rgb(TOKENS.peach), 0.55); });
  ctx.globalAlpha = 1;
}

// cursor light trail: newest points burn cream/mint, older ones cool to peach
function drawTrail(R, now) {
  const LIFE = 1300;
  while (R.trail.length && now - R.trail[0].t > LIFE) R.trail.shift();
  if (!R.trail.length) return;
  const ctx = R.ctx, cp = R.cellPx;
  const cols = [TOKENS.cream, mix(TOKENS.mint, TOKENS.cream, 0.4), TOKENS.mint, mix(TOKENS.mint, TOKENS.peach, 0.5), TOKENS.peach];
  for (let i = 0; i < R.trail.length; i++) {
    const p = R.trail[i], age = Math.min(1, Math.max(0, (now - p.t) / LIFE)); // 0 new .. 1 gone
    const rad = (1 - age) * 3.4 + 0.8; // in cells
    const ccx = p.x / cp, ccy = p.y / cp;
    const col = cols[Math.min(cols.length - 1, Math.floor(age * cols.length))];
    for (let y = Math.floor(ccy - rad); y <= Math.ceil(ccy + rad); y++)
      for (let x = Math.floor(ccx - rad); x <= Math.ceil(ccx + rad); x++) {
        if (x < 0 || y < 0 || x >= R.cols || y >= R.rows) continue;
        const d = Math.hypot(x + 0.5 - ccx, y + 0.5 - ccy) / rad;
        if (d > 1) continue;
        // a little sparkle at the edge so it reads as pixels, not a blob
        const n = Math.sin(x * 12.9898 + y * 78.233 + i) * 43758.5453; const r = n - Math.floor(n);
        if (d > 0.6 && r < 0.45) continue;
        ctx.globalAlpha = (1 - age) * (1 - d * 0.55) * 0.9;
        ctx.fillStyle = rgb(col);
        ctx.fillRect(x * cp, y * cp, cp - 1, cp - 1);
      }
  }
  ctx.globalAlpha = 1;
}
