/* Imagine TOFU v3 — After dark: the glass meadow.
   Scroll owns where you are (stations + scrubbed transitions);
   time owns what's alive (loops, the creature, the stardust wake).
   Called from main.js only when motion is allowed; the reduced / no-JS
   path keeps the .it-dream-duo fallback in index.html. */

import { media } from "./media.js";
import { LITE, isStrained } from "./perf.js";

const q = (s, c = document) => c.querySelector(s);

export function initDreamGlass({ gsap, ScrollTrigger }) {
  const scene = q(".it-dream-scene");
  const stage = scene && q(".it-dream-stage", scene);
  if (!stage || !q(".it-dg-tofu", stage)) return;

  const $ = (sel) => q(sel, stage);
  let mobile = matchMedia("(max-width: 899px)").matches;   // kept live by the PHONES block below
  const tofu = $(".it-dg-tofu"), body = $(".it-dg-body");
  const gMint = $(".it-dg-ghost--mint"), gPeach = $(".it-dg-ghost--peach");
  const canvas = $(".it-dg-trail"), ctx = canvas.getContext("2d");
  const fg = $(".it-dg-fg");
  const edgeTop = $(".it-dg-edge--top"), edgeBottom = $(".it-dg-edge--bottom");
  const vids = { s1: $(".it-dg-bd--s1"), s2: $(".it-dg-bd--s2"), s3: $(".it-dg-bd--s3"), tA: $(".it-dg-bd--ta"), tB: $(".it-dg-bd--tb") };

  /* ======================= TRANSITION SEQUENCES ======================= */
  // The two scrubbed camera moves (push into the field, rise into the canopy) are drawn from
  // pre-decoded WebP frames on a canvas instead of seeking a <video>. A video seek is asynchronous and
  // lands late, so the picture stepped while everything else moved at full frame rate. Drawing a decoded
  // frame is instant; in-between scroll positions blend the two neighbouring frames. Frames are fetched
  // on approach (desktop only), and decoded only while their transition is near (~3.7MB each decoded).
  // Frames: public/dream/glass/seq/{ta,tb}/001-061.webp (every 2nd frame of the 1280x720 clip).
  const SEQ_N = 61;
  const WINDOWED = navigator.userAgent.includes("Firefox/");
  // Decoding happens in a worker. Chrome already decodes createImageBitmap(blob) off the main thread, but
  // Firefox does it on the main thread: holding a transition decoded 61 1280x720 WebPs in one burst there and
  // dropped ~10 frames each time (measured at p 0.15-0.21 and 0.61-0.67). The worker hands back transferable
  // bitmaps, so the main thread never decodes. Falls back to main-thread decoding if a worker can't start.
  const decodeBitmap = (() => {
    let w = null; const pend = new Map(); let n = 0;
    try {
      const src = "self.onmessage=async(e)=>{const{id,blob}=e.data;try{const bm=await createImageBitmap(blob);self.postMessage({id,bm},[bm]);}catch(_){self.postMessage({id,bm:null});}};";
      w = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      w.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.bm ? p.res(e.data.bm) : p.rej(); };
      w.onerror = () => {   // e.g. a CSP that forbids blob: workers: finish what is queued on the main thread
        w = null; pend.forEach((p) => createImageBitmap(p.blob).then(p.res, p.rej)); pend.clear();
      };
    } catch (e) { w = null; }
    return (blob) => {
      if (!w) return createImageBitmap(blob);
      return new Promise((res, rej) => { const id = ++n; pend.set(id, { res, rej, blob }); w.postMessage({ id, blob }); });
    };
  })();
  function makeSeq(video, dir) {
    const c = document.createElement("canvas");
    c.className = video.className; c.setAttribute("aria-hidden", "true"); c.id = "it-dg-seq-" + dir;
    c.width = 1280; c.height = 720;                 // the frames' own size; CSS object-fit: cover frames it like the video
    video.replaceWith(c);
    const g = c.getContext("2d", { alpha: false });
    const blobs = new Array(SEQ_N).fill(null), bm = new Array(SEQ_N).fill(null);
    let fetching = false, held = false, last = -1;
    const url = (i) => media("/dream/glass/seq/" + dir + "/" + String(i + 1).padStart(3, "0") + ".webp");
    const ok = (j) => j >= 0 && j < SEQ_N && bm[j] instanceof ImageBitmap;
    // Firefox: never hold all 61 decoded frames (~225MB) at once. Allocating them in one burst stalled it for
    // ~10 frames at each transition (p 0.15-0.21 and 0.61-0.67), worker or not. There it keeps a sliding
    // window around the current frame (plus both hand-off frames), nearest first, two decodes in flight.
    // Chrome keeps the original hold-everything behavior.
    let cur = 0, inflight = 0;
    const WIN = 8;
    function decode(i) {
      if (bm[i] || !blobs[i]) return;
      bm[i] = "pending"; inflight++;
      decodeBitmap(blobs[i]).then((b) => {
        if (held) { bm[i] = b; last = -1; } else { b.close(); bm[i] = null; }
      }, () => { bm[i] = null; }).then(() => { inflight--; pump(); });
    }
    const keep = (j) => j === 0 || j === SEQ_N - 1 || Math.abs(j - cur) <= WIN + 3;
    function pump() {
      if (!held || !WINDOWED) return;
      for (let j = 0; j < SEQ_N; j++) if (bm[j] instanceof ImageBitmap && !keep(j)) { bm[j].close(); bm[j] = null; }
      const want = [0, SEQ_N - 1];
      for (let d = 0; d <= WIN; d++) want.push(cur + d, cur - d);
      for (const j of want) { if (inflight >= 2) break; if (j >= 0 && j < SEQ_N && !bm[j] && blobs[j]) decode(j); }
    }
    function load() {
      if (fetching) return; fetching = true;
      // hand-off frames first (first and last), then the rest in order, four requests at a time
      const order = [0, SEQ_N - 1]; for (let i = 1; i < SEQ_N - 1; i++) order.push(i);
      let k = 0;
      const worker = () => {
        if (k >= order.length) return;
        const i = order[k++];
        fetch(url(i)).then((r) => r.blob()).then((b) => { blobs[i] = b; if (held) WINDOWED ? pump() : decode(i); }, () => {}).then(worker);
      };
      for (let w = 0; w < 4; w++) worker();
    }
    function hold(on, at = 0) {
      if (on === held) return; held = on;
      if (on && WINDOWED) { cur = Math.round(Math.max(0, Math.min(1, at)) * (SEQ_N - 1)); pump(); }   // entering from below starts at the end
      else if (on) { for (let i = 0; i < SEQ_N; i++) decode(i); }
      else { for (let i = 0; i < SEQ_N; i++) { if (bm[i] instanceof ImageBitmap) bm[i].close(); bm[i] = null; } last = -1; }
    }
    function show(f) {
      const x = Math.max(0, Math.min(1, f)) * (SEQ_N - 1);
      if (WINDOWED && Math.round(x) !== cur) { cur = Math.round(x); pump(); }
      if (Math.abs(x - last) < 0.004) return;
      const i = Math.floor(x);
      let a = i; while (a >= 0 && !ok(a)) a--;
      let b = Math.min(SEQ_N - 1, i + 1); while (b < SEQ_N && !ok(b)) b++;
      if (a < 0 && b >= SEQ_N) return;
      g.globalAlpha = 1;
      if (a < 0) { g.drawImage(bm[b], 0, 0, 1280, 720); last = x; return; }
      g.drawImage(bm[a], 0, 0, 1280, 720);
      if (b < SEQ_N && b !== a) { const w = (x - a) / (b - a); if (w > 0.01) { g.globalAlpha = w; g.drawImage(bm[b], 0, 0, 1280, 720); g.globalAlpha = 1; } }
      last = x;
    }
    return { el: c, load, hold, show, get ready() { return ok(0); } };
  }
  const seqA = makeSeq(vids.tA, "ta"), seqB = makeSeq(vids.tB, "tb");
  vids.tA = seqA.el; vids.tB = seqB.el;
  const copies = [$(".it-dg-copy--1"), $(".it-dg-copy--3")];
  const cardW = $('.it-dream-card[data-side="w"]'), cardC = $('.it-dream-card[data-side="c"]'), xg = $(".it-dream-x-glyph");
  const blink = $(".it-dg-face--blink"), joy = $(".it-dg-face--joy"), eyes = $(".it-dg-eyes"), eyeL = $(".it-dg-eye--l"), eyeR = $(".it-dg-eye--r");

  /* ======================= SCROLL SCORE (fractions of the pin) ======================= */
  const SCORE = {
    s1: [0.00, 0.24], tA: [0.24, 0.36], s2: [0.36, 0.72], tB: [0.72, 0.82], s3: [0.82, 1.00],
    CF: 0.025,                                   // crossfade width at each hand-off
    copy: [[0.05, 0.11, 0.18, 0.23], [0.87, 0.92, 1.00, 1.00]],   // in-start, in-end, out-start, out-end
    fg: [0.36, 0.56],                            // foreground bloom sweeps right-to-left across station 2
    cardsOut: [0.67, 0.71],                      // wonder × craft leave before transition B (their entrance is keyed to the bloom's position)
    WAVE: 0.18,                                  // how long (fraction of the sweep) each card takes to bloom in once the flower reaches it
    PIN: "+=540%",                               // pin length
  };
  const lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => t * t * (3 - 2 * t);
  const clamp01 = (v) => Math.min(1, Math.max(0, v)), ramp = (p, a, b) => clamp01((p - a) / (b - a));
  const window01 = (p, [i0, i1, o0, o1]) => smooth(ramp(p, i0, i1)) * (1 - smooth(ramp(p, o0, o1)));

  /* ======================= TOFU PATH (viewport fractions) ======================= */
  const pathDesk = [
    { p: 0.00, x: 0.88, y: 0.60, s: 0.40, r: -8 },
    { p: 0.09, x: 0.74, y: 0.36, s: 0.58, r: -4 },
    { p: 0.18, x: 0.60, y: 0.52, s: 0.74, r: 2 },
    { p: 0.30, x: 0.52, y: 0.42, s: 0.86, r: -3 },   // riding transition A
    { p: 0.40, x: 0.50, y: 0.50, s: 1.00, r: 0 },    // dead center in the station-2 gap
    { p: 0.46, x: 0.40, y: 0.42, s: 1.00, r: 4 },    // peeks out as the fg bloom passes
    { p: 0.54, x: 0.50, y: 0.49, s: 0.92, r: 0 },    // settles between wonder × craft as they're waved in
    { p: 0.68, x: 0.50, y: 0.47, s: 0.92, r: 0 },    // holds there while the cards read
    { p: 0.80, x: 0.52, y: 0.22, s: 0.80, r: 3 },    // rising with transition B
    { p: 0.90, x: 0.53, y: 0.45, s: 0.88, r: -2 },   // settles INTO the light: down in the haze pocket, right of centre to balance the copy
    { p: 1.00, x: 0.55, y: 0.47, s: 0.90, r: 0 },    // holds in the glow (headroom above for the aurora rays) as the words land
  ];
  // phones: same journey, but the 9:16 canopy frame puts the mint haze pocket lower, so the
  // closing beats settle further down (copy still sits under it at bottom 12vh)
  // phones: station 3 sits lower (9:16 haze pocket) and a touch left of the desktop x so the aurora ring clears the right edge
  const pathPhone = pathDesk.map((k) => k.p === 0.80 ? { ...k, y: 0.30 } : k.p === 0.90 ? { ...k, x: 0.50, y: 0.46 } : k.p === 1.00 ? { ...k, x: 0.50, y: 0.44 } : k);
  // station 3 on desktop sits right of centre (x .53/.55) to balance the bottom-left copy on a 16:9
  // frame. On wide screens the copy is far off in the corner and the haze pocket is dead centre, so
  // the offset reads as off-centre instead: ease it back to .50 as the aspect ratio opens up.
  function wideCentre(z, p) {
    if (mobile || p < 0.80) return z;
    const aspect = W / Math.max(1, H), wide = smooth(ramp(aspect, 1.78, 2.2)), in3 = smooth(ramp(p, 0.80, 0.90));
    return { ...z, x: lerp(z.x, 0.50, wide * in3) };
  }
  function sample(p) {
    const path = mobile ? pathPhone : pathDesk;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if (p <= b.p) { const t = smooth((p - a.p) / (b.p - a.p)); return wideCentre({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), s: lerp(a.s, b.s, t), r: lerp(a.r, b.r, t) }, p); }
    }
    const z = path[path.length - 1]; return wideCentre({ x: z.x, y: z.y, s: z.s, r: z.r }, p);
  }

  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, LITE ? 1 : 1.5);   // full-stage canvas of soft dust: 1.5x is indistinguishable from 2x at ~half the pixels
    const r = stage.getBoundingClientRect(); W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  ScrollTrigger.addEventListener("refreshInit", resize);
  // element sizes read once per refresh, not per frame: a layout read after a style write forces the
  // browser to recalculate layout mid-frame (several times a frame, before this cache)
  const box = { tofu: 0, body: 0, fg: 0, ok: false };
  function boxes() { if (!box.ok) { box.tofu = tofu.offsetWidth; box.body = body.offsetWidth; box.fg = fg.offsetWidth; box.ok = true; } return box; }
  ScrollTrigger.addEventListener("refreshInit", () => { box.ok = false; });
  let fgC = null;   // the bloom's centre in stage px, published by shared() for the gaze
  fg.style.transformOrigin = "50% 40%";   // set once, not per frame

  /* ======================= THE CREATURE ======================= */
  // the whole personality lives in these knobs
  const STIFF = 34;        // spring stiffness: lower = lazier chase
  const DAMP = 6.2;        // damping: lower = more overshoot and wobble
  const LEAN = 0.028;      // deg of tilt per px/s of horizontal speed
  const SQUASH = 0.00030;  // squash/stretch per px/s of vertical speed
  const WANDER = 0.018;    // idle wander amplitude, fraction of stage height
  const FLIP_AT = 0.42;    // gaze threshold that turns the body
  let jigEyes = 0;         // eyes go wide while it's jiggling
  let lookLean = 0, mirror = 1, mirrorT = 1;   // painted cube faces LEFT; mirror -1 faces right

  const sp = { x: 0, y: 0, vx: 0, vy: 0, s: 0.5, vs: 0, init: false };
  const t0 = performance.now();
  function spring(dt, tx, ty, ts) {
    if (!sp.init) { sp.x = tx; sp.y = ty; sp.s = ts; sp.init = true; }
    sp.vx += ((tx - sp.x) * STIFF - sp.vx * DAMP) * dt; sp.vy += ((ty - sp.y) * STIFF - sp.vy * DAMP) * dt;
    sp.x += sp.vx * dt; sp.y += sp.vy * dt;
    sp.vs += ((ts - sp.s) * STIFF * 0.6 - sp.vs * DAMP * 0.9) * dt; sp.s += sp.vs * dt;
  }
  const wander = (t) => ({
    dx: (Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.91 + 1.3) * 0.4) * WANDER * H,
    dy: (Math.sin(t * 0.53 + 0.7) * 0.7 + Math.sin(t * 1.27 + 2.1) * 0.3) * WANDER * H,
    rot: Math.sin(t * 0.45) * 2.2 + Math.sin(t * 1.1 + 0.4) * 0.8,
    breath: 1 + Math.sin(t * 1.5) * 0.012,
  });
  let perk = 0, nextPerk = 5 + Math.random() * 5;
  // poke: a click anywhere on the cube sends it into a jelly wobble, a little hop, wide eyes, a burst of motes
  let jig = 0, jigPhase = 0, jigDir = 1, jigKick = 0;
  let joyUntil = 0;
  function poke(e) {
    if (typeof wakeNow === "function") wakeNow();
    jig = 1; jigPhase = 0; jigDir = Math.random() < 0.5 ? -1 : 1; jigKick = 1;
    sp.vy -= 240 + Math.random() * 120;                              // hop
    sp.vx += jigDir * (80 + Math.random() * 60);                     // sideways nudge, the spring brings it back
    if (lastPos) spawn(lastPos.cx, lastPos.cy, lastPos.size, 0, -300, 14);
    // the hero's poke face: crossfade to ≧◡≦ for the length of the wobble, with a glow surge, then settle
    if (joy) {
      joyUntil = performance.now() + 1100;
      gsap.to(joy, { opacity: 1, duration: 0.14, ease: "sine.out", overwrite: "auto" });
      gsap.to(joy, { opacity: 0, duration: 0.45, ease: "sine.inOut", delay: 0.95, overwrite: false });
      gsap.fromTo(body, { filter: "brightness(1)" }, { filter: "brightness(1.3)", duration: 0.2, ease: "power2.out", overwrite: "auto" });
      gsap.to(body, { filter: "brightness(1)", duration: 1, ease: "sine.out", delay: 0.24, overwrite: false });
    }
    if (e && e.preventDefault) e.preventDefault();
  }
  body.addEventListener("pointerdown", poke);
  function jiggle(dt) {
    if (jig <= 0.001) return { sx: 1, sy: 1, rot: 0, eyes: 0 };
    jigPhase += dt * 22;                                             // wobble frequency
    jig *= Math.exp(-dt * 3.2);                                      // decay over ~1s
    const w = Math.sin(jigPhase) * jig;
    return { sx: 1 + w * 0.16, sy: 1 - w * 0.16, rot: Math.sin(jigPhase * 0.5) * jig * jigDir * 9, eyes: jig };
  }
  function perkPulse(t, dt) {
    if (t > nextPerk) { perk = 1; nextPerk = t + 6 + Math.random() * 7; }
    perk = Math.max(0, perk - dt * 2.2); const e = Math.sin(perk * Math.PI);
    return { dy: -e * 0.035 * H, sx: 1 - e * 0.06, sy: 1 + e * 0.08 };
  }
  // per-frame transforms are written straight to the style: gsap.set() builds a tween object per call,
  // and this is ~4 calls a frame for as long as the scene is on screen. (None of these elements carry a CSS
  // transform or another GSAP transform tween, so there is nothing to compose with.)
  const lastTf = new WeakMap();
  const setTf = (el, v) => { if (lastTf.get(el) === v) return; lastTf.set(el, v); el.style.transform = v; };
  let lastPos = null, lastPose = null;
  function place(z, dt) {
    const t = (performance.now() - t0) / 1000, size = boxes().tofu, w = wander(t), pk = perkPulse(t, dt), jg = jiggle(dt);
    spring(dt, z.x * W + w.dx, z.y * H + w.dy + pk.dy, z.s);
    const lean = gsap.utils.clamp(-14, 14, -sp.vx * LEAN), sq = gsap.utils.clamp(-0.12, 0.12, sp.vy * SQUASH);
    setTf(tofu, `translate(${(sp.x - size / 2).toFixed(2)}px,${(sp.y - size / 2).toFixed(2)}px) rotate(${(z.r + w.rot + lean + lookLean + jg.rot).toFixed(3)}deg) scale(${(sp.s * w.breath).toFixed(4)})`);   // origin is the CSS default (centre)
    mirrorT = lerp(mirrorT, mirror, 0.16);
    const turning = 1 - Math.abs(mirrorT);
    setTf(body, `scale(${(mirrorT * (1 - sq) * pk.sx * jg.sx).toFixed(4)},${((1 + sq) * pk.sy * (1 + turning * 0.10) * jg.sy).toFixed(4)})`);
    jigEyes = jg.eyes;
    lastPose = { cx: sp.x, cy: sp.y, box: size, sc: sp.s * w.breath, rot: (z.r + w.rot + lean + lookLean + jg.rot) * Math.PI / 180 };
    return (lastPos = { cx: sp.x, cy: sp.y, size: size * sp.s });
  }

  /* ======================= STARDUST WAKE ======================= */
  const motes = [], MAX = LITE ? 36 : 90;
  // opaque colour per palette entry; a mote's fade goes through globalAlpha, so each fill no longer builds and
  // parses its own rgba() string (two per mote per frame before)
  const palette = [{ c: "rgb(158,217,191)", w: 0.5 }, { c: "rgb(241,234,217)", w: 0.4 }, { c: "rgb(243,181,156)", w: 0.1 }];
  const CREAM_RGB = "rgb(241,234,217)";
  // globalAlpha standing in for the alpha that used to sit in an rgba(..., a.toFixed(3)) string: the colour parser
  // rounds that alpha to 8 bits (round(a * 255) / 255, measured), and the rounding is part of the picture. With
  // "lighter" a near-invisible 0.002 becomes 1/255 and 160 piled-up strokes light the ring's draw-on seed; a float
  // 0.002 stores as nothing. So every alpha is snapped to that grid first. Same 3-decimal step, same 8-bit round.
  const a8 = (a) => Math.round(Math.round(a * 1000) / 1000 * 255) / 255;
  const pick = () => { let r = Math.random(); for (const p of palette) { if ((r -= p.w) <= 0) return p.c; } return palette[0].c; };
  function spawn(cx, cy, size, dx, dy, n) {
    for (let i = 0; i < n && motes.length < MAX; i++) {
      const ang = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 1.2, rad = size * 0.42 * (0.6 + Math.random() * 0.5);
      motes.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, vx: -dx * 0.18 + (Math.random() - 0.5) * 14, vy: -dy * 0.18 - 10 - Math.random() * 14,
        life: 0, ttl: 1.5 + Math.random(), r: 1.4 + Math.random() * 2.2, c: pick(), spark: Math.random() < 0.08 });
    }
  }
  // the wake canvas is touched only while it holds something: cleared once when the last mote dies, then
  // left alone (a full-stage clear every frame before, for most of the scene)
  let trailDirty = false;
  function drawMotes(dt) {
    if (!motes.length) { if (trailDirty) { ctx.clearRect(0, 0, W, H); trailDirty = false; } return; }
    ctx.clearRect(0, 0, W, H); trailDirty = true;
    let style = null;
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]; m.life += dt; if (m.life >= m.ttl) { motes.splice(i, 1); continue; }
      m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= 0.985; m.vy *= 0.985;
      const t = m.life / m.ttl, a = (1 - t) * (t < 0.1 ? t / 0.1 : 1);
      if (style !== m.c) ctx.fillStyle = style = m.c;
      ctx.globalAlpha = a8(0.16 * a); ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 3.2, 0, 6.283); ctx.fill();
      ctx.globalAlpha = a8(0.9 * a); ctx.beginPath(); ctx.arc(m.x, m.y, m.r * (m.spark ? 0.9 : 0.7), 0, 6.283); ctx.fill();
      if (m.spark) { ctx.globalAlpha = a8(0.5 * a); ctx.strokeStyle = CREAM_RGB; ctx.lineWidth = 0.8; ctx.beginPath();
        ctx.moveTo(m.x - m.r * 2.6, m.y); ctx.lineTo(m.x + m.r * 2.6, m.y); ctx.moveTo(m.x, m.y - m.r * 2.6); ctx.lineTo(m.x, m.y + m.r * 2.6); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
  }

  /* ======================= DISPERSION SPLIT ======================= */
  const qx1 = gsap.quickTo(gMint, "x", { duration: 0.25, ease: "power2.out" }), qy1 = gsap.quickTo(gMint, "y", { duration: 0.25, ease: "power2.out" });
  const qx2 = gsap.quickTo(gPeach, "x", { duration: 0.25, ease: "power2.out" }), qy2 = gsap.quickTo(gPeach, "y", { duration: 0.25, ease: "power2.out" });
  const qa1 = gsap.quickTo(gMint, "opacity", { duration: 0.2 }), qa2 = gsap.quickTo(gPeach, "opacity", { duration: 0.2 });

  /* ======================= AURORA RING (station 3 trial, Oct 22) ======================= */
  // A living orbit around the creature, drawn on two canvases: the back half sits behind the cube,
  // the front half in front of it (the logo / galaxy weave). Bands of light slide around the loop at
  // two speeds, colour drifts mint <-> peach with cream at the peaks, and the bright stretches throw
  // soft vertical curtain rays like an aurora. The spark is a comet head that lights the ribbon
  // behind it. It draws itself on as station 3 arrives (scrubbed, reversible); the ring only sways a
  // few degrees, nothing spins. Set RING_ON = false to remove it entirely.
  const RING_ON = true;
  const RG = {
    cx: 0.50, cy: 0.55, rx: 0.78, ry: 0.25,   // tofu-box units (1 = the creature's box width)
    tilt: -13, sway: 3.5,                      // degrees
    in: [0.84, 0.93], spark: [0.90, 0.95],     // pin fractions: draw-on, comet head
    N: LITE ? 84 : 160,                        // segments around the loop (phones: half, the ribbon still reads as a curve)
    flow: [1.4, 0.9], hueDrift: 0.6,           // band speeds (rad/s), colour drift speed
    ray: 0.52, lap: Math.PI / 3, glow: 0.68,   // glow = overall brightness of halo, rays and comet bloom (1 = original)
                  // max curtain height (box units), comet speed when free-running (rad/s; one lap per 6s, the video's tempo)
  };
  // Station 3 desktop loop (Seedance via Venice, Oct 23): an unseen light orbits the glass canopy once
  // per 6s loop, clockwise, igniting the petals it passes. tab = measured screen bearing of the lit
  // petals (deg, 0 = right, 90 = down) every 0.125s around the stage centre. While that loop plays the
  // comet head follows the video clock, so it always points at the petals it is lighting. lead (deg)
  // nudges the head ahead of (+) or behind (-) the light. Desktop and phone loops each have their own table.
  const S3_LIGHT = { lead: 0, follow: 0.3,
    desk: { dur: 6, tab: [247, 252, 258, 265, 273, 281, 289, 296, 303, 309, 315, 321, 328, 336, 344, 351, 359, 5, 12, 20, 29, 40, 50, 59, 67, 75, 82, 90, 97, 105, 112, 121, 131, 141, 152, 161, 170, 177, 182, 188, 193, 199, 206, 213, 220, 228, 235, 241] },
    // 9:16 loop: the glow travels inside the canopy (across the top, down the right strands, back along the
    // lowest tips, up the left), so it never streaks through the open mist; the table holds where the light dips back
    phone: { dur: 4.7083, tab: [189, 189, 193, 205, 225, 237, 251, 269, 283, 290, 294, 300, 305, 312, 320, 327, 335, 342, 350, 0, 8, 16, 23, 30, 36, 42, 61, 94, 129, 147, 155, 163, 172, 184, 189, 190] } };
  if (import.meta.env?.DEV) { window.__itS3Light = S3_LIGHT; window.__itRing = RG; }
  function s3LightBearing() {
    const v = vids.s3, L = mobile ? S3_LIGHT.phone : S3_LIGHT.desk;
    if (!L || !v || v.readyState < 2 || Math.abs((v.duration || 0) - L.dur) > 0.2) return null;   // only a loop whose table we measured
    const T = L.tab, n = T.length, f = ((v.currentTime % L.dur) / L.dur) * n;
    const i = Math.floor(f) % n, u = f - Math.floor(f);
    const a = T[i], d = ((T[(i + 1) % n] - a + 540) % 360) - 180;   // shortest arc between samples
    return (a + d * u + S3_LIGHT.lead) * Math.PI / 180;
  }
  let ringHead = 0, ringFree = 0, ringLastT = 0;
  const ring = {};
  if (RING_ON) {
    const mk = (part) => { const c = document.createElement("canvas"); c.className = "it-dg-ring it-dg-ring--" + part; c.setAttribute("aria-hidden", "true"); return c; };
    ring.back = mk("back"); ring.front = mk("front");
    tofu.insertBefore(ring.back, body);        // halo -> back half -> cube -> front half
    tofu.appendChild(ring.front);
    ring.b = ring.back.getContext("2d"); ring.f = ring.front.getContext("2d");
  }
  let ringPx = 0, ringOff = true;
  const C_MINT = [158, 217, 191], C_PEACH = [243, 181, 156], C_CREAM = [241, 234, 217];
  const mixC = (u, v, k) => [u[0] + (v[0] - u[0]) * k, u[1] + (v[1] - u[1]) * k, u[2] + (v[2] - u[2]) * k];
  const rgba = (c, al) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al.toFixed(3)})`;
  const TAU = Math.PI * 2, wrap = (v) => ((v % TAU) + TAU) % TAU;
  // How the ring is drawn (Oct 25): the same strokes in the same order as before. Every segment is still its own
  // stroke, because the look depends on it: the glow pen is wider than a segment is long, so with "lighter" the
  // round caps of neighbouring segments pile up into the soft halo; a single batched path would union those caps
  // and come out several times dimmer. What changed is the bookkeeping around each stroke:
  //   - a segment's colour is set once as an opaque rgb() shared by the glow and the ribbon, with the alpha in
  //     globalAlpha (snapped to the parser's 8-bit grid, see a8), and the hairline alpha is worked out once per
  //     frame: two colour parses per segment instead of three, and no rgba() string built for any of them.
  //     The ray gradients keep their exact per-stop alpha strings: a gradient's stops are rounded one by one,
  //     and no single globalAlpha reproduces that;
  //   - colour strings are cached by their integer rgb, so nothing is rebuilt once a tint has been seen;
  //   - the point maths runs on scalars instead of a fresh array per segment;
  //   - both canvases are visibility:hidden while the ring is off (most of the pin): a transparent canvas with
  //     mix-blend-mode still costs the compositor a screen-blend pass a frame, and screen with nothing is nothing.
  // Checked pixel for pixel against the old code (same inputs, both canvases, draw-on + steady + draw-off).
  const colCache = new Map();
  function colEntry(c) {
    const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0, key = (r << 16) | (g << 8) | b;   // same truncation as rgba()
    let e = colCache.get(key);
    if (!e) {
      if (colCache.size > 4096) colCache.clear();
      const s = r + "," + g + "," + b;
      e = { solid: "rgb(" + s + ")", pre: "rgba(" + s + ",", s0: "rgba(" + s + ",0.000)" };   // s0: what rgba(col, 0) built
      colCache.set(key, e);
    }
    return e;
  }
  function ringShow(on) {
    if (!RING_ON) return;
    const v = on ? "" : "hidden";
    if (ring.back.style.visibility !== v) { ring.back.style.visibility = v; ring.front.style.visibility = v; }
  }
  ringShow(false);
  function drawRing(p, t) {
    if (!RING_ON) return;
    const r = smooth(ramp(p, RG.in[0], RG.in[1]));
    if (r < 0.001) {
      if (!ringOff) { ring.b.clearRect(0, 0, ringPx, ringPx); ring.f.clearRect(0, 0, ringPx, ringPx); ringOff = true; ringShow(false); }
      // a slow frame can carry the scrub from the comet straight past the draw-off window: without this the
      // resonance kept lighting station 1 / 2 from a stale head until the next visit to station 3
      ring.head = null;
      return;
    }
    if (ringOff) ringShow(true);
    ringOff = false;
    const d = Math.min(devicePixelRatio || 1, LITE || isStrained() ? 1.25 : 1.5), px = Math.round(boxes().tofu * 2.2 * d);
    if (px !== ringPx) { ringPx = px; ring.back.width = ring.back.height = ring.front.width = ring.front.height = px; }
    const S = ringPx, U = S / 2.2;
    const ox = S / 2 + (RG.cx - 0.5) * U, oy = S / 2 + (RG.cy - 0.5) * U, rx = RG.rx * U, ry = RG.ry * U;
    const ang = (RG.tilt + Math.sin(t * 1.05) * RG.sway) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const pt = (th) => { const ex = rx * Math.cos(th), ey = ry * Math.sin(th); return [ox + ex * ca - ey * sa, oy + ex * sa + ey * ca]; };
    const gb = ring.b, gf = ring.f;
    gb.clearRect(0, 0, S, S); gb.globalCompositeOperation = "lighter"; gb.lineCap = "round";
    gf.clearRect(0, 0, S, S); gf.globalCompositeOperation = "lighter"; gf.lineCap = "round";
    // comet position: locked to the video's travelling light when the synced loop plays, else free-running.
    // Both feed the same eased angle, so switching between them glides instead of jumping.
    const dt = Math.min(0.1, Math.max(0, t - ringLastT)); ringLastT = t; ringFree += dt * RG.lap;
    const bearing = s3LightBearing();
    let target = ringFree;
    if (bearing != null) {
      const psi = bearing - ang - (lastPose ? lastPose.rot : 0);           // screen bearing -> the tilted ellipse's own frame
      target = Math.atan2(Math.sin(psi) / ry, Math.cos(psi) / rx);         // ellipse parameter that sits on that bearing
      ringFree = target;                                                   // free-run resumes from here if the sync drops
    }
    let dd = wrap(target - ringHead); if (dd > Math.PI) dd -= TAU;
    ringHead = wrap(ringHead + dd * (bearing != null ? S3_LIGHT.follow : 0.2));
    const so = smooth(ramp(p, RG.spark[0], RG.spark[1])), head = ringHead, start = 0.35, span = r * TAU;
    const N = RG.N, kGlow = 0.12 * RG.glow, kRib = 0.7 * (0.35 + 0.65 * RG.glow);
    const alF = r, alB = r * 0.72, hairF = a8(0.18 * alF), hairB = a8(0.18 * alB);   // front / back alpha, hairline alpha per canvas
    let px0 = ox + rx * Math.cos(start) * ca - ry * Math.sin(start) * sa, py0 = oy + rx * Math.cos(start) * sa + ry * Math.sin(start) * ca;
    // one segment at a time, in the original order: with anti-aliased coverage "lighter" is dst + cov * (clamp(src + dst) - dst),
    // so where strokes pile up and saturate (the draw-on seed) the order of the strokes is part of the picture
    for (let i = 1; i <= N; i++) {
      const th = start + (i / N) * span, mid = th - span / N / 2;
      const ex = rx * Math.cos(th), ey = ry * Math.sin(th), cx = ox + ex * ca - ey * sa, cy = oy + ex * sa + ey * ca;
      const front = Math.sin(mid) > 0, g = front ? gf : gb, al = front ? alF : alB;
      // flowing bands at two speeds, plus the comet's lit wake
      const band = (0.5 + 0.5 * Math.sin(3 * mid - t * RG.flow[0])) * (0.55 + 0.45 * Math.sin(5 * mid + t * RG.flow[1] + 1.7));
      const behind = wrap(head - mid), wake = so * (behind < 1.4 ? Math.pow(1 - behind / 1.4, 2) : 0);
      const I = Math.min(1, 0.22 + 0.78 * Math.pow(band, 0.8) + 0.7 * wake);
      let col = mixC(C_MINT, C_PEACH, 0.5 + 0.5 * Math.sin(2 * mid + t * RG.hueDrift));
      col = mixC(col, C_CREAM, Math.max(0, (I - 0.84) / 0.16) * 0.6);
      const e = colEntry(col);
      g.beginPath(); g.moveTo(px0, py0); g.lineTo(cx, cy);
      g.strokeStyle = e.solid;                                                                       // one parse for the glow and the ribbon
      g.globalAlpha = a8(kGlow * I * al); g.lineWidth = U * (0.06 + 0.1 * I); g.stroke();            // soft wide glow
      g.globalAlpha = a8(kRib * I * al); g.lineWidth = U * (0.008 + 0.022 * I); g.stroke();           // the ribbon
      g.strokeStyle = CREAM_RGB; g.globalAlpha = front ? hairF : hairB; g.lineWidth = U * 0.003; g.stroke();   // faint glass hairline
      if (I > 0.34) {                                                                 // curtain ray, screen-vertical (exact per-stop alphas)
        const h = U * RG.ray * Math.pow(I, 1.6) * (0.6 + 0.4 * Math.sin(t * 1.7 + i * 0.37) * Math.sin(t * 0.6 + i * 0.11));
        const gr = g.createLinearGradient(cx, cy, cx, cy - h);
        gr.addColorStop(0, e.pre + (0.34 * RG.glow * I * al).toFixed(3) + ")"); gr.addColorStop(0.35, e.pre + (0.14 * RG.glow * I * al).toFixed(3) + ")"); gr.addColorStop(1, e.s0);
        g.globalAlpha = 1; g.strokeStyle = gr; g.lineWidth = U * 0.02; g.beginPath(); g.moveTo(cx, cy - U * 0.01); g.lineTo(cx, cy - h); g.stroke();
      }
      px0 = cx; py0 = cy;
    }
    gb.globalAlpha = 1; gf.globalAlpha = 1;   // the head and everything after draw at full alpha, as before
    // comet head (only once its stretch of ring has been drawn)
    ring.head = null;
    if (so > 0.01 && wrap(head - start) <= span) {
      const [hx, hy] = pt(head), g = Math.sin(head) > 0 ? ring.f : ring.b, tw = 0.85 + 0.25 * Math.sin(t * 5.3);
      const hc = mixC(mixC(C_MINT, C_PEACH, 0.5 + 0.5 * Math.sin(2 * head + t * RG.hueDrift)), C_CREAM, 0.45);
      ring.head = { bx: (hx - S / 2) / U, by: (hy - S / 2) / U, so, tw, col: hc, r };
      const gl = g.createRadialGradient(hx, hy, 0, hx, hy, U * 0.09);
      gl.addColorStop(0, rgba(C_CREAM, 0.75 * RG.glow * so)); gl.addColorStop(1, rgba(C_CREAM, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(hx, hy, U * 0.09, 0, TAU); g.fill();
      const k = U * 0.045 * tw, w = k * 0.17;
      g.fillStyle = rgba(C_CREAM, 0.95 * so); g.beginPath();
      g.moveTo(hx, hy - k); g.lineTo(hx + w, hy - w); g.lineTo(hx + k, hy); g.lineTo(hx + w, hy + w);
      g.lineTo(hx, hy + k); g.lineTo(hx - w, hy + w); g.lineTo(hx - k, hy); g.lineTo(hx - w, hy - w); g.closePath(); g.fill();
    }
  }

  /* ======================= RESONANCE (backdrop answers the ring) ======================= */
  // A stage-sized canvas, screen-blended over the station-3 video, carries a wide soft light that
  // follows the comet head: the foliage and haze around it catch the comet's colour and brighten as it
  // passes, and the whole pocket breathes faintly with it. Drawn from the ring's published head
  // position, so it stays locked to the ring however the creature moves. Two gradients a frame.
  const RESO_ON = RING_ON;
  const RESO = { reach: 0.66, strength: 0.40, breath: 0.10, lag: 0.18,   // head light radius (×H), its alpha, ambient pulse alpha, follow smoothing
    // petal flare: bright facets of the video frame near the comet flare in its colour (dark areas never do)
    petalReach: 0.52, petalThr: 110, petalGain: 1.7, petalStrength: 1.0, glints: 12, sample: 6 };   // reach ×H, luma threshold 0-255, gain, alpha, star count, downsample
  if (import.meta.env?.DEV) window.__itReso = RESO;   // tune from the console in dev
  let reso = null, resoCtx = null, resoOff = true, resoX = 0, resoY = 0;
  let vc = null, vctx = null, hc = null, hctx = null, hImg = null, glintSeed = [];
  if (RESO_ON) {
    reso = document.createElement("canvas"); reso.className = "it-dg-reso"; reso.setAttribute("aria-hidden", "true");
    canvas.parentNode.insertBefore(reso, canvas);        // above backdrop, vignette and seams; below the wake and the creature
    resoCtx = reso.getContext("2d");
  }
  // hidden while it holds nothing (everything before the comet lights): a transparent full-stage canvas with
  // mix-blend-mode: screen still costs the compositor a full-screen blend pass every frame
  function resoShow(on) {
    if (!RESO_ON) return;
    const v = on ? "" : "hidden";
    if (reso.style.visibility !== v) reso.style.visibility = v;
  }
  resoShow(false);
  function drawReso(t) {
    if (!RESO_ON) return;
    const h = ring.head, pose = lastPose;
    if (!h || !pose || h.so < 0.01) {
      if (!resoOff) { resoCtx.clearRect(0, 0, W, H); resoOff = true; resoShow(false); }
      return;
    }
    if (resoOff) resoShow(true);
    resoOff = false;
    const rk = LITE || isStrained() ? 0.5 : 1;   // soft glow only: 1x on desktop, half-res on phones (a quarter of the pixels to clear, fill and blend)
    if (reso.width !== Math.round(W * rk) || reso.height !== Math.round(H * rk)) {
      reso.width = Math.round(W * rk); reso.height = Math.round(H * rk); reso.style.width = W + "px"; reso.style.height = H + "px";
      resoCtx.setTransform(rk, 0, 0, rk, 0, 0);   // everything below stays in stage px
    }
    // comet head in stage px: box-unit offset, scaled and rotated with the creature
    const ex = h.bx * pose.box * pose.sc, ey = h.by * pose.box * pose.sc, c = Math.cos(pose.rot), s = Math.sin(pose.rot);
    const hx = pose.cx + ex * c - ey * s, hy = pose.cy + ex * s + ey * c;
    resoX = lerp(resoX || hx, hx, RESO.lag); resoY = lerp(resoY || hy, hy, RESO.lag);   // the light trails the head a touch, like afterglow
    const g = resoCtx; g.clearRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
    const k = h.so * h.r;
    // 1. the head's light on the world
    const R = H * RESO.reach * (0.9 + 0.1 * h.tw);
    const gl = g.createRadialGradient(resoX, resoY, 0, resoX, resoY, R);
    gl.addColorStop(0, rgba(h.col, RESO.strength * k)); gl.addColorStop(0.28, rgba(h.col, RESO.strength * 0.42 * k)); gl.addColorStop(1, rgba(h.col, 0));
    g.fillStyle = gl; g.fillRect(resoX - R, resoY - R, R * 2, R * 2);
    // 2. the pocket breathes with the ring, in step with the comet's lap
    const br = RESO.breath * k * (0.5 + 0.5 * Math.sin(ringHead)), R2 = H * 0.95;
    const am = g.createRadialGradient(pose.cx, pose.cy, 0, pose.cx, pose.cy, R2);
    am.addColorStop(0, rgba(C_MINT, br)); am.addColorStop(0.5, rgba(C_MINT, br * 0.35)); am.addColorStop(1, rgba(C_MINT, 0));
    g.fillStyle = am; g.fillRect(pose.cx - R2, pose.cy - R2, R2 * 2, R2 * 2);
    // 3. the glass petals catch the comet: highlight pass on the live video frame
    petalFlare(g, t, resoX, resoY, h, k);
  }
  // Samples the station-3 frame at 1/N resolution, keeps only pixels above a luma threshold (the
  // crystal facets and bloom centres), weights them by distance to the comet head, tints them with
  // the comet's colour and composites them back with "lighter". The brightest few nearest the head
  // get a twinkling 4-point glint. ~100k pixels a frame on desktop: a couple of ms.
  let petalFrame = 0, petalCands = [];
  function petalFlare(g, t, hx, hy, h, k) {
    const v = vids.s3; if (mobile || isStrained() || !v || v.readyState < 2 || RESO.petalStrength <= 0) return;   // (strained desktops: the readback stalls the GPU)   // phones: the video carries the glow
    // sample the video every third frame (GPU readback + pixel pass); in between, redraw the cached flare
    const fresh = (petalFrame++ % 3) === 0;
    const N = RESO.sample, w4 = Math.max(16, Math.round(W / N)), h4 = Math.max(16, Math.round(H / N));
    if (!vc) { vc = document.createElement("canvas"); vctx = vc.getContext("2d", { willReadFrequently: true }); hc = document.createElement("canvas"); hctx = hc.getContext("2d"); }
    if (vc.width !== w4 || vc.height !== h4) { vc.width = hc.width = w4; vc.height = hc.height = h4; hImg = hctx.createImageData(w4, h4); }
    // mirror object-fit: cover, object-position 50% 60%
    const vw = v.videoWidth || 16, vh = v.videoHeight || 9, sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc;
    const tc = h.col;
    if (fresh) {
    try { vctx.drawImage(v, (W - dw) * 0.5 / N, (H - dh) * 0.6 / N, dw / N, dh / N); } catch (e) { return; }
    let src; try { src = vctx.getImageData(0, 0, w4, h4).data; } catch (e) { return; }
    const out = hImg.data, hx4 = hx / N, hy4 = hy / N, reach4 = (H * RESO.petalReach) / N, thr = RESO.petalThr, gain = RESO.petalGain;
    const cands = [];
    for (let y = 0, i = 0; y < h4; y++) {
      const dy = y - hy4;
      for (let x = 0; x < w4; x++, i += 4) {
        const r = src[i], gg = src[i + 1], b = src[i + 2];
        const l = r * 0.3 + gg * 0.59 + b * 0.11;
        let a = 0;
        if (l > thr) {
          const dx = x - hx4, d = Math.sqrt(dx * dx + dy * dy);
          if (d < reach4) {
            const wgt = Math.pow(1 - d / reach4, 1.6), vv = Math.min(1, ((l - thr) / (255 - thr)) * gain);
            a = vv * wgt * k;
            if (a > 0.55) cands.push([x, y, a]);
          }
        }
        out[i] = (tc[0] + r) * 0.5; out[i + 1] = (tc[1] + gg) * 0.5; out[i + 2] = (tc[2] + b) * 0.5; out[i + 3] = (a * 255 * RESO.petalStrength) | 0;
      }
    }
    hctx.putImageData(hImg, 0, 0);
    cands.sort((p, q) => q[2] - p[2]); cands.length = Math.min(RESO.glints, cands.length); petalCands = cands;
    }
    g.globalCompositeOperation = "lighter";
    g.imageSmoothingEnabled = true; g.drawImage(hc, 0, 0, w4, h4, 0, 0, W, H);
    // glints on the brightest facets nearest the head
    const cands = petalCands, n = cands.length;
    for (let i = 0; i < n; i++) {
      const [x, y, a] = cands[i], px = (x + 0.5) * N, py = (y + 0.5) * N;
      const tw = 0.5 + 0.5 * Math.sin(t * 6.5 + x * 1.7 + y * 2.3), al = a * tw * 0.85, kk = 5 + 9 * tw * a, ww = kk * 0.16;
      g.fillStyle = rgba(C_CREAM, al); g.beginPath();
      g.moveTo(px, py - kk); g.lineTo(px + ww, py - ww); g.lineTo(px + kk, py); g.lineTo(px + ww, py + ww);
      g.lineTo(px, py + kk); g.lineTo(px - ww, py + ww); g.lineTo(px - kk, py); g.lineTo(px - ww, py - ww); g.closePath(); g.fill();
      const gl = g.createRadialGradient(px, py, 0, px, py, kk * 1.6);
      gl.addColorStop(0, rgba(tc, al * 0.6)); gl.addColorStop(1, rgba(tc, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(px, py, kk * 1.6, 0, TAU); g.fill();
    }
  }

  /* ======================= BLINK ======================= */
  (function scheduleBlink() {
    setTimeout(() => {
      if (performance.now() < joyUntil || peaceful) return scheduleBlink();   // no blink over the joy face or a peaceful rest
      blink.style.opacity = 1; eyes.style.opacity = 0; setTimeout(() => { blink.style.opacity = 0; eyes.style.opacity = 1; scheduleBlink(); }, 160); }, 3800 + Math.random() * 4200);
  })();

  /* ======================= PEACEFUL (station 3) ======================= */
  // in the canopy it periodically lets its eyes drift shut and rests for a few seconds: the
  // closed-eyes frame eases in slowly (not a blink), holds, and eases open again. a poke wakes it.
  let peaceful = false, peaceTimer = 0, peaceP = 0;
  const PEACE = { minGap: 5000, gapJitter: 5000, hold: 3200, holdJitter: 2200, ease: 0.55 };
  function restNow() {
    if (peaceful || performance.now() < joyUntil) return;
    peaceful = true;
    blink.style.transition = `opacity ${PEACE.ease}s ease-in-out`; eyes.style.transition = `opacity ${PEACE.ease}s ease-in-out`;
    blink.style.opacity = 1; eyes.style.opacity = 0;
    peaceTimer = setTimeout(wakeNow, PEACE.hold + Math.random() * PEACE.holdJitter);
  }
  function wakeNow() {
    if (!peaceful) return;
    clearTimeout(peaceTimer); peaceful = false;
    blink.style.opacity = 0; eyes.style.opacity = 1;
    setTimeout(() => { blink.style.transition = ""; eyes.style.transition = ""; }, PEACE.ease * 1000 + 50);
  }
  let nextPeace = 0;
  function peaceTick(p, now) {
    peaceP = p;
    const inCanopy = p >= 0.86;
    if (!inCanopy) { if (peaceful) wakeNow(); nextPeace = now + 1800 + Math.random() * 1500; return; }
    if (!peaceful && now >= nextPeace) { restNow(); nextPeace = now + PEACE.hold + PEACE.holdJitter + PEACE.minGap + Math.random() * PEACE.gapJitter; }
  }

  /* ======================= GAZE ======================= */
  // a vector in [-1,1]^2 (x right, y down). sources blended by weight:
  //   station 1: slow turns left/right taking in the meadow   travel: looks where it's going
  //   bloom: watches the foreground flower cross              cards: glances between wonder and craft
  //   canopy: looks up in station 3                           idle: drift + saccades so it never stares
  const GAZE_PX = 0.019;
  const gz = { x: 0, y: 0 };
  let sacc = { x: 0, y: 0 }, nextSacc = 2, eyesVis = "";
  function gazeTarget(p, t, pos) {
    let gx = gsap.utils.clamp(-1, 1, sp.vx / 520), gy = gsap.utils.clamp(-1, 1, sp.vy / 520);
    const fo = fgC ? fgC.o : 0;
    if (fo > 0.05) { const bx = fgC.x, by = fgC.y;
      const vx = bx - pos.cx, vy = by - pos.cy, L = Math.hypot(vx, vy) || 1;
      gx = lerp(gx, vx / L, fo * 0.85); gy = lerp(gy, vy / L, fo * 0.85); }
    const s1w = 1 - smooth(ramp(p, 0.20, 0.27));
    if (s1w > 0.01) {
      const ph = Math.sin(2 * Math.PI * (p * 3.2 + t * 0.11));
      const look = Math.sign(ph) * Math.pow(Math.abs(ph), 0.45) * 0.95;   // lingers at each side
      gx = lerp(gx, look, s1w * 0.9); gy = lerp(gy, -0.15 + Math.sin(t * 0.9) * 0.1, s1w * 0.6);
      lookLean = look * 4.0 * s1w;
    } else lookLean = 0;
    const cw = lastCardsIn;
    if (cw > 0.01) { const side = Math.sin(t * 0.5) > 0 ? 1 : -1; gx = lerp(gx, side * 0.85, cw * 0.8); gy = lerp(gy, 0.05, cw * 0.6); }
    const up = smooth(ramp(p, 0.80, 0.90));
    gx = lerp(gx, 0.15, up); gy = lerp(gy, -1.0, up);
    // ...then, as the closing words land bottom-left, it glances down at them with the reader
    const read = smooth(ramp(p, 0.93, 1.0));
    gx = lerp(gx, -0.75, read); gy = lerp(gy, 0.55, read);
    if (t > nextSacc) { sacc = { x: (Math.random() - 0.5) * 0.9, y: (Math.random() - 0.5) * 0.6 }; nextSacc = t + 2 + Math.random() * 3; }
    gx += Math.sin(t * 0.6) * 0.12 + sacc.x * 0.5; gy += Math.sin(t * 0.8 + 1) * 0.08 + sacc.y * 0.5;
    return { x: gsap.utils.clamp(-1, 1, gx), y: gsap.utils.clamp(-1, 1, gy) };
  }
  function lookAt(p, t, pos) {
    const g = gazeTarget(p, t, pos);
    gz.x = lerp(gz.x, g.x, 0.14); gz.y = lerp(gz.y, g.y, 0.14);   // eyes lead, the body follows
    if (gz.x > FLIP_AT) mirror = -1;
    if (gz.x < -FLIP_AT) mirror = 1;
    const bw = boxes().body, dx = gz.x * GAZE_PX * bw * mirror, dy = gz.y * GAZE_PX * bw * 0.8;
    const widen = 1 + Math.max(0, -gz.y) * 0.10 + jigEyes * 0.22;
    const et = `translate(${dx.toFixed(2)}px,${dy.toFixed(2)}px) scaleY(${widen.toFixed(3)})`;
    setTf(eyeL, et); setTf(eyeR, et);
    const joyOn = performance.now() < joyUntil, ev = joyOn ? "hidden" : "";
    if (eyesVis !== ev) { eyesVis = ev; eyes.style.visibility = ev; }   // written on change only, not every frame
    peaceTick(p, performance.now());
  }

  /* ======================= BACKDROP CONDUCTOR ======================= */
  let progress = 0;
  ScrollTrigger.create({
    trigger: scene, start: "top top", end: SCORE.PIN, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true,
    onUpdate(s) { progress = s.progress; },
  });

  let lastCardsIn = 0;
  const playing = {};
  function want(v, on) {
    if (on && !playing[v.id]) { if (v.dataset.dgReload) { delete v.dataset.dgReload; v.load(); } const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); playing[v.id] = true; }
    if (!on && playing[v.id]) { v.pause(); playing[v.id] = false; }
  }
  // give the videos ids for the maps above
  Object.entries(vids).forEach(([k, v]) => { if (v && !v.id) v.id = "it-dg-" + k; });

  /* ======================= PHONES (≤899px) ======================= */
  // 9:16 station loops from public/dream/glass/mobile/ (720×1280, ≈3.7MB for all three), and the two
  // scrubbed transitions are never fetched: each becomes a slow dissolve between station loops
  // instead (1→2 pushes in, 2→3 rises). Desktop is unchanged.
  const phoneMQ = matchMedia("(max-width: 899px)");
  function setLoopSources(isPhone) {
    const base = isPhone ? "/dream/glass/mobile/station" : "/dream/glass/station";
    ["s1", "s2", "s3"].forEach((k, i) => {
      const v = vids[k]; if (!v) return;
      const src = base + (i + 1);
      if (!v.dataset.dgSrc) v.dataset.dgSrc = "/dream/glass/station" + (i + 1);   // what index.html ships
      if (v.dataset.dgSrc === src) return;
      if (playing[v.id]) { v.pause(); playing[v.id] = false; }
      v.poster = src + ".webp";
      v.querySelectorAll("source").forEach((s) => { s.src = media(src + (s.type === "video/webm" ? ".webm" : ".mp4")); });
      v.dataset.dgSrc = src;
      v.dataset.dgReload = "1";                   // want() re-runs source selection right before the first play;
    });                                           // calling load() here would start fetching on page load
  }
  phoneMQ.addEventListener("change", (e) => {
    mobile = e.matches; if (active) setLoopSources(mobile);
    gsap.set([vids.s1, vids.s2, vids.s3], { scale: 1, yPercent: 0 }); lastSet = new WeakMap(); cxCache.clear();
    if (!mobile && active) warm();
  });

  // per-frame style writes go through put(): identical values (resting at a station) write nothing
  let lastSet = new WeakMap();
  function put(el, props) {
    let key = ""; for (const k in props) { const v = props[k]; key += k + (typeof v === "number" ? Math.round(v * 1000) : v) + ";"; }
    if (lastSet.get(el) === key) return;
    lastSet.set(el, key); gsap.set(el, props);
  }
  // card centres in stage px, untransformed and cached: reading layout every frame right after
  // writing styles forced a synchronous reflow per frame. Re-measured on every ScrollTrigger refresh.
  const cxCache = new Map();
  ScrollTrigger.addEventListener("refreshInit", () => cxCache.clear());
  function cardCx(el) {
    if (!el) return 0;
    let v = cxCache.get(el);
    if (v == null) { const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(); v = r.left - sr.left + r.width * 0.5 - (Number(gsap.getProperty(el, "x")) || 0); cxCache.set(el, v); }
    return v;
  }
  function conduct(p) {
    const { s1, tA, s2, tB, s3, CF } = SCORE;
    if (mobile) conductPhone(p, SCORE); else conductDesk(p, SCORE);
    shared(p);
  }
  // phones: the incoming station dissolves in OVER the outgoing one (which holds at full opacity
  // underneath until the dissolve completes, so the frame never dips toward the ground color)
  function conductPhone(p, { s1, s2, tA, tB, s3, CF }) {
    const xA = smooth(ramp(p, tA[0] - CF, tA[1] + CF)), xB = smooth(ramp(p, tB[0] - CF, tB[1] + CF));
    const vS1 = xA > 0.999 ? 0 : 1, vS2 = xB > 0.999 ? 0 : xA, vS3 = xB;
    put(vids.tA, { opacity: 0 }); put(vids.tB, { opacity: 0 });
    put(vids.s1, { opacity: vS1, scale: 1 + 0.06 * xA });                                // leans forward as it hands off
    put(vids.s2, { opacity: vS2, scale: 1.08 - 0.08 * xA + 0.03 * xB, yPercent: 3 * xB });   // arrives from a step back (push-in)
    put(vids.s3, { opacity: vS3, scale: 1.04 - 0.04 * xB, yPercent: -5 * (1 - xB) });     // drops in from above (rise into the canopy)
    want(vids.s1, vS1 > 0.01); want(vids.s2, vS2 > 0.01); want(vids.s3, vS3 > 0.01);
    // fetch + decode a first frame of each loop a scene ahead (as on desktop). Left to want(), the file is
    // requested and the decoder spun up at the very moment the dissolve starts: a stall on the main thread
    prime(vids.s2, p > s1[0] + (s1[1] - s1[0]) * 0.5); prime(vids.s3, p > s2[0]);
    if (edgeTop) put(edgeTop, { opacity: 1 - smooth(ramp(p, s1[1] - CF, tA[1])) });
    if (edgeBottom) put(edgeBottom, { opacity: smooth(ramp(p, tB[0], s3[0] + CF)) });
  }
  function conductDesk(p, { s1, tA, s2, tB, s3, CF }) {
    const oS1 = 1 - smooth(ramp(p, s1[1] - CF, s1[1] + CF));
    const oTA = smooth(ramp(p, tA[0] - CF, tA[0] + CF)) * (1 - smooth(ramp(p, tA[1] - CF, tA[1] + CF)));
    const oS2 = smooth(ramp(p, s2[0] - CF, s2[0] + CF)) * (1 - smooth(ramp(p, s2[1] - CF, s2[1] + CF)));
    const oTB = smooth(ramp(p, tB[0] - CF, tB[0] + CF)) * (1 - smooth(ramp(p, tB[1] - CF, tB[1] + CF)));
    const oS3 = smooth(ramp(p, s3[0] - CF, s3[0] + CF));
    // hand-off guard: a transition that hasn't decoded a frame yet paints nothing, so until it has
    // (readyState >= 2) the outgoing station stays up in its place. Its last frame is the transition's first.
    const readyA = seqA.ready, readyB = seqB.ready;
    const vS1 = readyA ? oS1 : Math.max(oS1, oTA), vTA = readyA ? oTA : 0;
    const vS2 = readyB ? oS2 : Math.max(oS2, oTB), vTB = readyB ? oTB : 0;
    put(vids.s1, { opacity: vS1 }); put(vids.tA, { opacity: vTA }); put(vids.s2, { opacity: vS2 }); put(vids.tB, { opacity: vTB }); put(vids.s3, { opacity: oS3 });
    want(vids.s1, vS1 > 0.01); want(vids.s2, vS2 > 0.01); want(vids.s3, oS3 > 0.01);
    // seam feathers: top rides with station 1 and goes with it; bottom arrives with station 3
    if (edgeTop) put(edgeTop, { opacity: 1 - smooth(ramp(p, s1[1] - CF, tA[1])) });
    if (edgeBottom) put(edgeBottom, { opacity: smooth(ramp(p, tB[0], s3[0] + CF)) });
    // fetch + decode each loop a scene ahead, so it is ready (not spinning up) when it fades in
    prime(vids.s2, p > s1[0] + (s1[1] - s1[0]) * 0.5); prime(vids.s3, p > s2[0]);
    // decoded frames live only around their own transition (never both at once)
    seqA.hold(p > tA[0] - 0.12 && p < tA[1] + 0.12, ramp(p, tA[0], tA[1])); seqB.hold(p > tB[0] - 0.14 && p < tB[1] + 0.12, ramp(p, tB[0], tB[1]));
    if (oTA > 0.001) seqA.show(ramp(p, tA[0], tA[1]));
    if (oTB > 0.001) seqB.show(ramp(p, tB[0], tB[1]));
  }
  function shared(p) {
    copies.forEach((c, i) => { if (!c) return; const o = window01(p, SCORE.copy[i]); put(c, { opacity: o, y: 12 * (1 - o) }); });
    const [f0, f1] = SCORE.fg, fo = smooth(ramp(p, f0, f0 + 0.05)) * (1 - smooth(ramp(p, f1 - 0.05, f1))), ft = ramp(p, f0, f1);
    const fw = boxes().fg, fx0 = W * 1.05, fx1 = -fw * 0.62;
    const fx = lerp(fx0, fx1, ft);                                   // bloom's left edge in stage px
    // the bloom is sized off the stage height (CSS) and seated so its bottom ~30% (the stem and the
    // cutout's straight edge) stays below the stage: the head passes big, the stem never shows
    const fy = H - fw * 0.70 + lerp(H * 0.06, -H * 0.05, ft);
    fgC = { x: fx + fw * 0.5, y: fy + fw * 0.4, o: fo };
    put(fg, { opacity: fo, x: fx, y: fy, rotation: lerp(7, -5, ft), scale: lerp(1.0, 1.1, ft) });

    // wonder × craft are waved into existence by the passing flower: each card blooms in as the
    // flower's centre sweeps across it (craft first on the right, then the ×, then wonder on the left),
    // with a push in the flower's direction of travel and a scale-up, like it was brushed awake.
    const bloomCx = fx + fw * 0.5;
    const at = cardCx;
    const waveSpan = SCORE.WAVE * (fx0 - fx1);
    const wave = (cx) => smooth(ramp(cx - bloomCx, -waveSpan * 0.25, waveSpan * 0.75));   // 0 before the flower reaches cx, 1 once it has passed
    const out = 1 - smooth(ramp(p, SCORE.cardsOut[0], SCORE.cardsOut[1]));
    const inC = wave(at(cardC)) * out, inW = wave(at(cardW)) * out, inX = wave(at(xg)) * out;
    const eC = smooth(inC), eW = smooth(inW), eX = smooth(inX);
    if (cardC) put(cardC, { opacity: inC, x: 60 * (1 - eC) - 14 * (1 - eC), y: "-50%", rotation: 6 * (1 - eC), scale: 0.9 + 0.1 * eC });
    if (cardW) put(cardW, { opacity: inW, x: 60 * (1 - eW), y: "-50%", rotation: 6 * (1 - eW), scale: 0.9 + 0.1 * eW });
    if (xg) put(xg, { opacity: inX * 0.9, scale: 0.6 + 0.4 * eX, xPercent: -50, yPercent: -50 });
    lastCardsIn = Math.max(inC, inW);
  }

  /* ======================= FRAME LOOP ======================= */
  // only run while the scene is near the viewport: loops pause, the ticker work stops
  let active = false, prevPos = null, last = performance.now();
  // explicit length (pre-roll + pin + tail) because "bottom" of a pinned trigger moves with the pin.
  // The tail is the stage's own height: the scene stays alive until its last pixel has scrolled off.
  // (It used to stop 0.4 screens after the pin let go, with most of the canopy still on screen: the
  // creature, ring and station-3 loop froze mid-exit.)
  ScrollTrigger.create({ trigger: scene, start: "top 120%", end: () => "+=" + Math.round(innerHeight * (1.2 + 5.4) + stage.getBoundingClientRect().height + 40), invalidateOnRefresh: true,
    onToggle(s) { active = s.isActive;
      if (active) { setLoopSources(mobile); warm(); } else { want(vids.s1, false); want(vids.s2, false); want(vids.s3, false); } } });
  // the transitions are preload="none" (weight): nothing fetches until the scene is near, then we
  // load them ourselves and seek to the first frame so a decoded frame exists before the hand-off
  const primed = {};
  function prime(v, on) {
    if (!on || !v || primed[v.id]) return; primed[v.id] = true;
    if (v.readyState >= 2) return;
    delete v.dataset.dgReload;   // phones: this load() IS the source switch; want() must not restart it at play time
    v.addEventListener("loadedmetadata", () => { try { v.currentTime = 0.04; } catch (e) {} }, { once: true });   // decode a first frame
    v.preload = "auto"; v.load();
  }
  let warmed = false;
  function warm() {
    if (warmed || mobile) return; warmed = true;
    seqA.load(); setTimeout(() => seqB.load(), 1500);   // the push-in's frames first
  }

  let heavyDt = 0, heavyN = 0;
  gsap.ticker.add(() => {
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!active) return;
    conduct(progress);
    const pos = place(sample(progress), dt);
    lookAt(progress, (now - t0) / 1000, pos);
    // phones: the three canvases (ring, resonance light, stardust) redraw every other frame (half the display rate; on a
    // 60Hz screen, 60fps on 120Hz). They are soft glows; the creature + scene transforms above stay full rate.
    heavyDt += dt; heavyN++;
    const heavy = !(LITE || isStrained()) || (heavyN & 1) === 0;
    if (heavy) { drawRing(progress, (now - t0) / 1000); drawReso((now - t0) / 1000); }
    let dx = 0, dy = 0; if (prevPos) { dx = (pos.cx - prevPos.cx) / dt; dy = (pos.cy - prevPos.cy) / dt; } prevPos = pos;
    const speed = Math.hypot(dx, dy), k = Math.min(speed / 1400, 1), amt = 7.5 * k, ux = speed > 1 ? dx / speed : 1, uy = speed > 1 ? dy / speed : 0;
    if (!LITE) { qx1(-ux * amt * mirror); qy1(-uy * amt); qx2(ux * amt * mirror); qy2(uy * amt); qa1(0.55 * k); qa2(0.5 * k); }   // ghosts are hidden on phones (lite.css)
    if (speed > 60) spawn(pos.cx, pos.cy, pos.size, ux * speed, uy * speed, Math.round(1 + 4 * k));
    if (heavy) { drawMotes(heavyDt); heavyDt = 0; }
  });
}
