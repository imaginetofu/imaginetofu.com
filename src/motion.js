/* Imagine TOFU v3 — motion choreography.
   Only ever constructed when prefers-reduced-motion is not set.
   Timing/easing tokens come from the brand system: reveals 0.8–1.2s,
   ease-out only, stagger 0.06–0.12s, no bounce, no 360° spins. */

import { CustomEase } from "gsap/CustomEase";
import { media, MEDIA_BASE } from "./media.js";
import { isOn, LITE, GECKO, isStrained } from "./perf.js";

// the hero cube is position:fixed and rides on into Hello, so its idle loops stay alive for both
const cubeOn = () => isOn("hero") || isOn("intro");

const q = (s, c = document) => c.querySelector(s);
const qa = (s, c = document) => [...c.querySelectorAll(s)];

/* stroke-draw helpers */
function prepDraw(shapes) {
  shapes.forEach((s) => {
    const len = s.getTotalLength ? s.getTotalLength() : 0;
    s.style.strokeDasharray = len;
    s.style.strokeDashoffset = len;
  });
}

/* split element text into word spans, preserving <em> etc. */
function splitWords(el, wrap) {
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const parts = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) frag.append(" ");
          else frag.append(wrap(p));
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) walk(child);
    });
  };
  walk(el);
}
const wrapMask = (word) => {
  const outer = document.createElement("span");
  outer.className = "it-w";
  const inner = document.createElement("span");
  inner.className = "it-w-in";
  inner.textContent = word;
  outer.append(inner);
  return outer;
};
const wrapScrub = (word) => {
  const span = document.createElement("span");
  span.className = "it-sw";
  span.textContent = word;
  return span;
};

export function initMotion({ gsap, ScrollTrigger, lenis }) {
  gsap.registerPlugin(CustomEase);
  // brand reveal ease: cubic-bezier(0.22, 1, 0.36, 1)
  CustomEase.create("itReveal", "M0,0 C0.22,1 0.36,1 1,1");
  gsap.defaults({ ease: "itReveal", duration: 1 });

  /* ---------------- initial states (behind the preloader) ---------------- */

  gsap.set(".it-hero-text .it-line-in", { yPercent: 120 });
  gsap.set(".it-hero-sub, .it-hero-actions", {
    autoAlpha: 0,
    y: 26,
    filter: "blur(10px)",
  });
  // only the open (calm) frame plays the entrance reveal. blink + joy keep
  // their CSS opacity:0 (visible, transparent) so their own crossfades can
  // raise them on cue — otherwise the intro would light every frame at once
  // and the stacked screen-blend would show all three faces at load.
  gsap.set(".it-cube-media:not(.it-cube-blink):not(.it-cube-joy)", { autoAlpha: 0, y: 34, scale: 0.95 });
  gsap.set(".it-hero .it-aura, .it-hero-cosmos, .it-scroll-cue", { autoAlpha: 0 });

  const sproutLines = qa(".it-sprouts .it-stem");
  prepDraw(sproutLines);
  // the sprouts are HTML boxes that CSS places at the old svg view-box scale (--it-sp-s in sections.css, the
  // xMidYMax meet math of the 1440x420 box). GSAP writes px on the tofu <svg> roots, so every travel that used
  // to be in old user units is multiplied by that same scale here.
  const sproutsEl = q(".it-sprouts");
  let sproutScale = 1;
  const measureSprouts = () => {
    if (!sproutsEl) return;
    const r = sproutsEl.getBoundingClientRect();
    sproutScale = Math.min(r.width / 1440, r.height / 420) || 1;
  };
  measureSprouts();
  let sprt;
  addEventListener("resize", () => { clearTimeout(sprt); sprt = setTimeout(measureSprouts, 120); }, { passive: true });
  // start tucked down inside the sprout leaves, scaling up from its base so
  // it climbs OUT of the sprout rather than dropping/bouncing in from above.
  // (SVG viewBox is 1440-wide but scaled to the hero, so the offset is large
  // in user-units to read as a visible rise on screen.)
  gsap.set(".it-sprout-tofu", { scale: 0, y: 96 * sproutScale, transformOrigin: "50% 100%" });
  gsap.set(".it-sd-top", { scale: 0 });

  /* ---------------- preloader (counter + rotating words) ---------------- */

  // The mold press: a tiny tofu edge-rolls GameCube-style through a 3×3 mold,
  // stamping a curd block into each cell along a snake path. The counter climbs
  // in real ninths, the three words land on the row turns, then the nine cells
  // fuse into one tofu that presses firm (no bounce) and blinks awake.
  function runPreloader() {
    return new Promise((resolve) => {
      const pre = q(".it-preloader");
      if (!pre || getComputedStyle(pre).display === "none") return resolve();

      lenis?.stop();
      const mold = q(".it-pre-mold", pre);
      const roller = q(".it-pre-roller", pre);
      const block = q(".it-pre-block", pre);
      const face = q(".it-pre-face", pre);
      const words = q(".it-pre-words", pre);
      const counter = q(".it-pre-counter", pre);
      const label = q(".it-pre-label", pre);

      const CELL = 29, GAP = 3, N = 3, STEP = CELL + GAP;
      const ROLL = 175; // per-step edge-roll (compositor-driven, jank-resistant)

      // build the nine cells (row 0 = bottom), inject before the roller
      const cells = [];
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++) {
          const d = document.createElement("div");
          d.className = "it-pre-cell";
          d.style.left = c * STEP + "px";
          d.style.top = (N - 1 - r) * STEP + "px";
          mold.insertBefore(d, roller);
          cells.push(d);
        }
      const cellAt = (r, c) => cells[r * N + c];

      // snake path: bottom L→R, middle R→L, top L→R (the GameCube climb)
      const path = [];
      for (let r = 0; r < N; r++) {
        const cols = [...Array(N).keys()];
        if (r % 2) cols.reverse();
        cols.forEach((c) => path.push({ r, c }));
      }
      const xy = ({ r, c }) => ({ x: c * STEP, y: (N - 1 - r) * STEP });
      const WORDS = { 0: "Seed,", 3: "Seed, sprout,", 8: "Seed, sprout, <em>press.</em>" };

      gsap.set(label, { autoAlpha: 0, y: -12 });
      gsap.to(label, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power2.out" });

      // 10 roll steps: two approach rolls off-left, then the nine snake cells.
      // steps[k].idx is the path index once inside the mold (-1 while approaching).
      const bottomY = (N - 1) * STEP;
      const steps = [
        { x: -2 * STEP, y: bottomY, idx: -2 },
        { x: -STEP, y: bottomY, idx: -1 },
        ...path.map((p, i) => ({ ...xy(p), idx: i })),
      ];
      roller.style.transform = `translate(${steps[0].x}px, ${steps[0].y}px)`;
      let prev = steps[0];

      const rollTo = (s) => {
        const dir = s.x > prev.x ? 1 : s.x < prev.x ? -1 : 0;
        const up = s.y < prev.y;
        const a = roller.animate(
          [
            { transform: `translate(${prev.x}px,${prev.y}px) rotate(0deg)` },
            { transform: `translate(${s.x}px,${s.y}px) rotate(${up ? -90 : dir * 90}deg)` },
          ],
          { duration: ROLL, easing: "cubic-bezier(.34,.06,.66,.94)", fill: "forwards" }
        );
        prev = s;
        return a;
      };
      // a curd block appears only once the cube has LANDED on its cell
      // (it pops in under the cube and is revealed as the cube rolls on)
      const stamp = (idx) => {
        if (idx >= 0 && idx < path.length - 1) cellAt(path[idx].r, path[idx].c).classList.add("on");
      };

      // The snake is rAF/clock-driven (bounded, catch-up safe). But the payoff
      // beats — land, fuse, press, blink, reveal — must play as a strict
      // SEQUENCE with real gaps, so we CHAIN them (each schedules the next on
      // completion) anchored to when the snake actually finishes. Elapsed-time
      // gating collapsed them into one frame under boot jank, which let the
      // curtain lift (and the hero cube show) before the tofu had landed.
      const SNAKE = 1900; // 10 even roll beats
      let lastStep = 0, finishing = false;
      const start = performance.now();
      let raf;

      const settle = () => {
        const last = path[path.length - 1];
        cellAt(last.r, last.c).classList.add("on"); // roller becomes the 9th cell
        roller.style.opacity = 0;
        setTimeout(fuse, 200);
      };
      const fuse = () => {
        cells.forEach((d, i) => {
          const r = Math.floor(i / N), c = i % N;
          const dx = (1 - c) * GAP, dy = (1 - (N - 1 - r)) * GAP * -1;
          d.style.transition = "transform .38s cubic-bezier(.22,1,.36,1)";
          d.style.transform = `translate(${dx}px,${dy}px) scale(1.02)`;
        });
        setTimeout(press, 300);
      };
      const press = () => {
        block.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, fill: "forwards" });
        setTimeout(() => cells.forEach((d) => (d.style.opacity = 0)), 260); // tuck cells under the block
        block.animate(
          [
            { transform: "scale(1,1)" },
            { transform: "scale(1.05,.94)", offset: 0.45 },
            { transform: "scale(1,1)" },
          ],
          { duration: 520, easing: "cubic-bezier(.22,1,.36,1)" }
        );
        setTimeout(awaken, 300);
      };
      const awaken = () => {
        face.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: "forwards" });
        qa(".it-pre-f-eye", face).forEach((el) => {
          el.animate(
            [{ transform: "scaleY(1)" }, { transform: "scaleY(.12)", offset: 0.5 }, { transform: "scaleY(1)" }],
            { duration: 260, delay: 360, easing: "ease-in-out" }
          );
        });
        setTimeout(reveal, 820); // let the tofu land and blink before the curtain lifts
      };
      // fallback curtain: dissolve IN PLACE, never a slide (a slide-up
      // uncovered the hero from the bottom: the "cube before the tofu lands"
      // bug). Used when there's no hero ground to bloom into.
      const dissolve = () => {
        gsap.to(pre, {
          autoAlpha: 0,
          duration: 0.7,
          ease: "power2.inOut",
          onComplete: () => {
            pre.style.display = "none";
            lenis?.start();
            resolve();
          },
        });
      };
      // the vortex bloom (Dennis, Oct 2026): the hero's cosmic swirl pours
      // OUT of the pressed tofu. The whole .it-hero-cosmos layer starts as a
      // tiny orb pinned to the tofu (scaled ~8% around the video's glow
      // point, translated so the glow sits on the tofu), then grows to full
      // frame while its glow travels to the rest pose. A soft radial mask
      // opens with it so the frame's edges never read as a box. The tofu
      // rides the glow and hands off to the hero cube (heroIntro starts
      // mid-bloom, so the cube rises exactly where the little tofu fades).
      const reveal = () => {
        const hero = q(".it-hero");
        const cosmos = q(".it-hero-cosmos");
        const cubeEl = q(".it-cube");
        if (!hero || !cosmos) return dissolve();
        const hr = hero.getBoundingClientRect();
        const W = hero.clientWidth, H = hero.clientHeight;
        // hero-local glow: desktop = cover-crop math, mobile = glow-pinned line
        const g = matchMedia("(min-width: 900px)").matches
          ? glowPoint(W, H)
          : { x: W / 2, y: MOB_GLOW_Y * H };
        const br = block.getBoundingClientRect();
        const tx = br.left + br.width / 2 - (hr.left + g.x);
        const ty = br.top + br.height / 2 - (hr.top + g.y);
        // mask radius that clears the farthest hero corner from the glow
        const R = Math.hypot(Math.max(g.x, W - g.x), Math.max(g.y, H - g.y)) * 1.25;
        const S0 = 0.08;
        const R0 = 46 / S0; // the orb is already ~46px on screen at frame one
        const DUR = 2.4;
        // growth must be SEEN (small → full), so this one beat eases in
        // gently before the long brand ease-out tail
        const bloomEase = CustomEase.create("itBloom", "M0,0 C0.5,0 0.22,1 1,1");
        // orb (radial, around the glow) INTERSECTED with feathered frame
        // edges (--bloom-e, 18% → 0) so the video's rectangle never shows
        const feather = (dir) =>
          `linear-gradient(${dir}, transparent 0%, #000 var(--bloom-e), #000 calc(100% - var(--bloom-e)), transparent 100%)`;
        const mask = `radial-gradient(circle at ${g.x}px ${g.y}px, #000 calc(var(--bloom-r) * 0.5), transparent var(--bloom-r)), ${feather("to bottom")}, ${feather("to right")}`;
        cosmos.style.webkitMaskImage = mask;
        cosmos.style.maskImage = mask;
        cosmos.style.webkitMaskComposite = "source-in";
        cosmos.style.maskComposite = "intersect";
        cosmos.style.willChange = "transform";
        const cw = cubeEl?.offsetWidth || 0;
        const cleanup = () => {
          gsap.set(cosmos, { clearProps: "x,y,scale,transform,transformOrigin" });
          cosmos.style.webkitMaskImage = cosmos.style.maskImage = cosmos.style.willChange = "";
          cosmos.style.webkitMaskComposite = cosmos.style.maskComposite = "";
          cosmos.style.removeProperty("--bloom-r");
          cosmos.style.removeProperty("--bloom-e");
          pre.style.display = "none";
          lenis?.start();
        };
        gsap.set(pre, { "--pre-bg": 1 });
        gsap
          .timeline({ onComplete: cleanup })
          // the mold's chrome steps aside first: label, words, counter, outline
          .to([label, words, counter, q(".it-pre-moldline", pre)], { autoAlpha: 0, duration: 0.45, ease: "power2.out" }, 0)
          .fromTo(
            cosmos,
            { autoAlpha: 1, x: tx, y: ty, scale: S0, transformOrigin: `${g.x}px ${g.y}px`, "--bloom-r": `${R0}px`, "--bloom-e": "18%" },
            { x: 0, y: 0, scale: 1, duration: DUR, ease: bloomEase },
            0.1
          )
          // the opening lags the growth: a small glowing orb first, then the sky
          .to(cosmos, { "--bloom-r": `${R}px`, duration: DUR, ease: "power1.inOut" }, 0.1)
          // edge feather melts away over the back half (0% = no mask at all)
          .to(cosmos, { "--bloom-e": "0%", duration: DUR * 0.55, ease: "power1.inOut" }, 0.1 + DUR * 0.45)
          // the curtain's ground thins out underneath (the hero ground matches)
          .to(pre, { "--pre-bg": 0, duration: 1.2, ease: "power1.inOut" }, 0.2)
          // the little tofu bows out IN PLACE (Dennis, Oct 22: it no longer
          // rides the glow or turns into the hero cube; the hero cube makes
          // its own entrance once the tofu is gone)
          .to(mold, { autoAlpha: 0, scale: 0.9, duration: 0.4, ease: "power2.in" }, 0)
          // hero entrance overlaps the tail of the bloom (cube rises into place)
          .add(() => resolve(), 1.25);
      };

      const tick = (now) => {
        const e = now - start;
        // advance to whichever step the clock is on (stamp any we skipped)
        const target = Math.min(steps.length - 1, 1 + Math.floor((e / SNAKE) * (steps.length - 1)));
        if (target > lastStep) {
          for (let k = lastStep + 1; k <= target; k++) {
            const idx = steps[k].idx;
            if (idx >= 0) {
              if (k < target) stamp(idx); // skipped under jank: stamp now
              counter.textContent = String(Math.round(((idx + 1) / path.length) * 100)).padStart(3, "0");
              if (WORDS[idx]) words.innerHTML = WORDS[idx];
            }
          }
          const hop = rollTo(steps[target]); // animate only the final hop so rolls never overlap
          const hopIdx = steps[target].idx;
          hop.onfinish = () => stamp(hopIdx);
          lastStep = target;
        }
        // once the last roll is out, hand off to the chained landing sequence
        if (!finishing && lastStep >= steps.length - 1) {
          finishing = true;
          cancelAnimationFrame(raf);
          setTimeout(settle, ROLL); // let that final roll finish first
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }

  /* ---------------- hero entrance ---------------- */

  function heroIntro() {
    const master = gsap.timeline();
    master
      .addLabel("go")
      // seedlings grow: stems draw up, leaf-and-bean tops unfurl
      .to(
        sproutLines,
        { strokeDashoffset: 0, duration: 1.1, ease: "power2.out", stagger: 0.12 },
        "go"
      )
      .to(
        ".it-sd-top",
        { scale: 1, duration: 0.6, ease: "power2.out", stagger: 0.1 },
        "go+=0.7"
      )
      .add(startBubbleCycle, "go+=1.8")
      .to(
        ".it-hero .it-aura, .it-hero-cosmos",
        { autoAlpha: 1, duration: 1.2, ease: "power2.out" },
        "go"
      )
      .to(".it-hero-text .it-line-in", { yPercent: 0, stagger: 0.09 }, "go+=0.1")
      .to(
        ".it-cube-media:not(.it-cube-blink):not(.it-cube-joy)",
        { autoAlpha: 1, y: 0, scale: 1, duration: 1.15, ease: "power3.out" },
        "go+=0.25"
      )
      .to(
        ".it-hero-sub, .it-hero-actions",
        // clearProps: a leftover inline blur(0px) is a no-op filter the paragraph would otherwise be
        // composited through on every rotating-word reflow (same pixels without it)
        { autoAlpha: 1, y: 0, filter: "blur(0px)", duration: 0.9, stagger: 0.1, clearProps: "filter" },
        "go+=0.55"
      )
      .to(".it-scroll-cue", { autoAlpha: 1, duration: 0.6, ease: "power2.out" }, "go+=1.15")
      .add(startHeroLoops, "go+=1.2");
    return master;
  }

  function startBubbleCycle() {
    // each seedling blows a bubble that rises, pops, and becomes a tofu
    qa(".it-sprouts .it-sway").forEach((group, i) => {
      const bubble = group.querySelector(".it-bubble");
      const tofu = group.querySelector(".it-sprout-tofu");
      if (!bubble || !tofu) return;
      gsap
        .timeline({ delay: i * 0.28 + gsap.utils.random(0, 0.25) })
        .to(bubble, { opacity: 1, duration: 0.2, ease: "power1.out" })
        .to(
          bubble,
          {
            y: -gsap.utils.random(30, 42),
            x: gsap.utils.random(-6, 6),
            duration: 0.85,
            ease: "power1.out",
          },
          0
        )
        // pop! — the tofu emerges out of the sprout: it scales up from its
        // base and rises the last stretch into its floating rest position.
        .to(bubble, { scale: 1.35, opacity: 0, duration: 0.12, ease: "power1.in" })
        .to(
          tofu,
          { scale: 1, y: 0, duration: gsap.utils.random(0.7, 0.95), ease: "back.out(1.2)" },
          "-=0.05"
        );
    });
    gsap.delayedCall(2.4, startTofuFloat);
  }

  // DEV: replay the sprout emergence on demand (press "R", or call
  // window.__replaySprouts() in the console) so the pop-out can be tuned
  // without sitting through the preloader each time. Dev server only.
  if (import.meta.env?.DEV) {
    const replaySprouts = () => {
      gsap.killTweensOf(".it-sprout-tofu");
      gsap.set(".it-sprout-tofu", { scale: 0, y: 96 * sproutScale, transformOrigin: "50% 100%" });
      gsap.set(".it-bubble", { scale: 1, opacity: 0 });
      startBubbleCycle();
    };
    window.__replaySprouts = replaySprouts;
    window.addEventListener("keydown", (e) => {
      if (e.key === "r" || e.key === "R") replaySprouts();
    });
  }

  function startTofuFloat() {
    // zero-g drift: composes with the parent .it-sway CSS rotate (do not
    // kill the sway — GSAP writes the child transform, no conflict). The
    // tofu is an <svg> root, so this is a CSS transform on an HTML box
    // (compositor), scaled from the old user units by sproutScale.
    qa(".it-sprout-tofu").forEach((tofu, i) => {
      gsap.to(tofu, {
        x: () => gsap.utils.random(-24, 24) * sproutScale,
        y: () => gsap.utils.random(-38, -14) * sproutScale, // upward bias = lift-off
        rotation: () => gsap.utils.random(-7, 7), // capped, never a spin
        transformOrigin: "50% 50%",
        duration: () => gsap.utils.random(6, 12),
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        repeatRefresh: true, // fresh random targets each cycle
        delay: i * 0.35,
      });
    });
  }

  /* imagination mind-waves: mint/peach motes rise from the cube and
     gather into a soft cloud above it. Canvas is absolute inside the
     hero so it clips/scrolls away naturally. Desktop + fine pointer
     only; paused off-screen and when the tab is hidden. */
  /* the hero video's glow origin (vortex base) in frame fractions —
     measured from the stabilized loop. Mapped through object-fit: cover
     math so the cube and the trail particles pin to the real on-screen
     spot at any viewport aspect ratio. */
  const GLOW = { x: 0.6316, y: 0.7022, vw: 2444, vh: 1376 }; // measured live; re-mapped Oct 2026 for the white-edge crop
  function glowPoint(w, h) {
    const s = Math.max(w / GLOW.vw, h / GLOW.vh); // object-fit: cover scale
    const dx = (w - GLOW.vw * s) / 2;
    const dy = (h - GLOW.vh * s) / 2;
    return { x: dx + GLOW.x * GLOW.vw * s, y: dy + GLOW.y * GLOW.vh * s };
  }

  // drift with the vortex: the wisp base sways a few px across the loop —
  // measured offline (50 samples / 9.967s, frame-width fractions). Shared
  // by the desktop cube journey AND the mobile glow-pinned cube.
  // re-mapped Oct 2026 for the crossfade-looped re-encode (9.25s, seam baked in)
  const TIP_SWAY = [0.0014, 0.001, 0.0007, 0.0009, 0.0009, 0.0006, 0.0002, -0.0002, -0.0005, -0.0009, -0.0012, -0.002, -0.0027, -0.0038, -0.0045, -0.0053, -0.006, -0.0062, -0.0059, -0.0048, -0.003, -0.0012, 0.0001, 0.0009, 0.0013, 0.0012, 0.0013, 0.0013, 0.0008, 0.0008, 0.0005, 0.0003, 0.0003, 0.0002, 0.0003, 0.0004, 0.0005, 0.0009, 0.0015, 0.0023, 0.0027, 0.0031, 0.0033, 0.0034, 0.0033, 0.0029, 0.0022, 0.0017, 0.0016, 0.0015];
  const LOOP_DUR = 9.25;
  // mobile hero: on-screen y (viewport-height fraction) where placeMobile
  // pins the glow — the particle system's vortex base must agree
  const MOB_GLOW_Y = 0.505;

  function startHeroAura() {
    // runs on mobile too now (Dennis, Jul 2026) — fewer, tighter motes
    // there; reduced-motion never constructs this module at all
    const canvas = q(".it-hero-motes");
    const hero = q(".it-hero");
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d", { alpha: true });

    const css = getComputedStyle(document.documentElement);
    const MINT = css.getPropertyValue("--it-mint").trim() || "#9ed9bf";
    const PEACH = css.getPropertyValue("--it-peach").trim() || "#f3b59c";

    let W = 0, H = 0, dpr = 1, G, maxH = 0, hMin = 0, rScale = 1, rafId = 0, running = false, last = 0;
    let particles = [];
    let stars = [];

    // prebuilt glow sprites (avoid per-particle gradients/shadowBlur)
    const makeSprite = (color) => {
      const s = document.createElement("canvas");
      s.width = s.height = 16;
      const c = s.getContext("2d");
      const g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, color);
      g.addColorStop(0.5, color);
      g.addColorStop(1, "transparent");
      c.fillStyle = g;
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(8, 8, 8, 0, Math.PI * 2);
      c.fill();
      return s;
    };
    const CREAM = css.getPropertyValue("--it-cream").trim() || "#f1ead9";
    const sprites = {
      mint: makeSprite(MINT),
      peach: makeSprite(PEACH),
      cream: makeSprite(CREAM),
    };
    // drawImage() from a <canvas> source re-snapshots that canvas on every call (~94 per frame here);
    // an ImageBitmap of the same pixels is drawn as-is. Swapped in once decoded, live particles re-point.
    if (typeof createImageBitmap === "function") {
      for (const k of Object.keys(sprites)) {
        createImageBitmap(sprites[k]).then((bm) => {
          const old = sprites[k];
          sprites[k] = bm;
          for (const p of particles) if (p.sprite === old) p.sprite = bm;
        }).catch(() => {});
      }
    }

    const cap = () =>
      matchMedia("(max-width: 899px)").matches
        ? gsap.utils.clamp(22, 36, Math.round(64 * (W / 1440))) // lighter on phones
        : gsap.utils.clamp(44, 80, Math.round(64 * Math.min(1, W / 1440)));

    const seedStars = () => {
      // fixed, slowly twinkling cream specks — the night-sky depth
      stars = Array.from({ length: 30 }, () => ({
        x: gsap.utils.random(0, W),
        y: gsap.utils.random(0, H * 0.7),
        size: gsap.utils.random(0.6, 1.4),
        base: gsap.utils.random(0.1, 0.5),
        freq: gsap.utils.random(0.3, 1.1),
        phase: gsap.utils.random(0, Math.PI * 2),
      }));
    };

    const measure = () => {
      W = hero.clientWidth;
      H = hero.clientHeight;
      // soft additive glows on a screen-blended canvas the size of the hero: 1.5x on a full-tier desktop,
      // 1.25x on phones and strained desktops (one third fewer pixels to clear, rasterise and upload)
      dpr = Math.min(LITE || isStrained() ? 1.25 : 1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // vortex base — particles orbit this axis. On mobile the glow is
      // pinned by placeMobile's zoomed-out framing, not by cover-crop math.
      G = matchMedia("(max-width: 899px)").matches
        ? { x: W / 2, y: H * MOB_GLOW_Y }
        : glowPoint(W, H);
      // narrower funnel on narrow screens — match the visible swirl column
      rScale = Math.min(1, W / 900);
      maxH = Math.max(200, G.y - H * 0.06); // climb high — they melt INTO the cloud
      // sparks are born right at the cube's top face (the vortex exit) —
      // the glow itself is inside the cube now
      const cubeEl = q(".it-cube");
      // 0.34 ≈ the VISIBLE top face (the render has big transparent margins)
      hMin = Math.min((cubeEl?.offsetWidth || 0) * 0.34, maxH - 160);
      seedStars();
    };

    const rand = gsap.utils.random;
    /* helical vortex trails: each particle climbs a slow spiral around
       the axis rising from the glow (no gathering) — funnel-shaped,
       depth-faked with an elliptical orbit. Cream ones are rare fast
       "sparks" with a twinkle. Token colors only. */
    const SPIN = -1; // orbit direction — matches the video's drift
    const spawn = (p = {}, seed = 0) => {
      p.theta = rand(0, Math.PI * 2);
      p.omega = SPIN * rand(0.28, 0.6); // rad/s — slow, majestic
      p.r0 = rand(34, 150) * rScale;
      p.h = hMin + seed * (maxH - hMin); // stagger on first fill
      p.vh = rand(16, 30); // climb speed, px/s
      p.size = rand(1.2, 3);
      const roll = Math.random();
      if (roll < 0.62) { p.sprite = sprites.mint; p.color = MINT; p.spark = 0; }
      else if (roll < 0.92) { p.sprite = sprites.peach; p.color = PEACH; p.spark = 0; }
      else {
        // cream spark: quicker, brighter, twinkles
        p.sprite = sprites.cream; p.color = CREAM; p.spark = 1;
        p.vh *= 1.6; p.omega *= 1.35; p.size = rand(0.8, 1.6);
        p.tw = rand(5, 9); // twinkle frequency
      }
      p.phase = rand(0, Math.PI * 2);
      p.trail = [];
      return p;
    };

    const update = (p, dt, now) => {
      p.h += p.vh * dt;
      if (p.h >= maxH) spawn(p);
      p.theta += p.omega * dt;
      const t = (p.h - hMin) / (maxH - hMin); // 0 at the cube's top face → 1 at the cloud
      const r = p.r0 * (0.22 + 1.05 * Math.max(0, t)); // funnel: tight at exit, wide on top
      const px = G.x + Math.cos(p.theta) * r;
      const py = G.y - p.h - Math.sin(p.theta) * r * 0.2; // tilted orbit
      p.trail.push(px, py);
      if (p.trail.length > 14) p.trail.splice(0, 2); // short comet tail
      const depth = Math.sin(p.theta); // -1 behind the axis … 1 in front
      let a = (0.2 + 0.42 * (0.55 + 0.45 * depth)) *
        Math.min(1, t / 0.04) * Math.min(1, (1 - t) / 0.25); // fast fade-in → visibly born at the face
      if (p.spark) a *= 0.65 + 0.35 * Math.sin(now * 0.001 * p.tw + p.phase);
      p.alpha = a;
      p.scale = 0.75 + 0.35 * depth;
    };

    // Trails and heads go in two passes (trails grouped by colour, then heads): "lighter" is additive, so
    // draw order cannot change a pixel, and it turns 64 strokeStyle + 64 lineCap sets per frame into 3 + 1.
    // Every segment keeps its own width and alpha: at 60fps a segment is well under a pixel long, so the
    // stacked round caps ARE the comet smear (one gradient path per trail would draw it 2-3x dimmer).
    const drawTrail = (p) => {
      const n = p.trail.length;
      if (n < 4) return;
      // fading streak along the spiral path
      for (let i = 2; i < n; i += 2) {
        const k = i / n;
        ctx.globalAlpha = p.alpha * k * 0.65;
        ctx.lineWidth = Math.max(0.6, p.size * p.scale * k);
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 2], p.trail[i - 1]);
        ctx.lineTo(p.trail[i], p.trail[i + 1]);
        ctx.stroke();
      }
    };
    const drawHead = (p) => {
      const n = p.trail.length;
      if (n < 4) return;
      // bright head
      const hx = p.trail[n - 2], hy = p.trail[n - 1];
      ctx.globalAlpha = p.alpha;
      const r = p.size * p.scale * (p.spark ? 4 : 3);
      ctx.drawImage(p.sprite, hx - r, hy - r, r * 2, r * 2);
    };
    const COLORS = [...new Set([MINT, PEACH, CREAM])];

    const drawStars = (now) => {
      const t = now * 0.001;
      for (const s of stars) {
        ctx.globalAlpha = s.base * (0.55 + 0.45 * Math.sin(t * s.freq + s.phase));
        const r = s.size * 2.2;
        ctx.drawImage(sprites.cream, s.x - r, s.y - r, r * 2, r * 2);
      }
    };

    let skip = 0;
    const tick = (now) => {
      // Firefox phones: every canvas update is a texture upload + a redraw of the blended layer, so the motes
      // draw every other frame there (their motion is slow; dt covers both frames)
      if ((GECKO || isStrained()) && (skip++ & 1)) { rafId = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      drawStars(now);
      for (const p of particles) update(p, dt, now);
      ctx.lineCap = "round";
      for (const c of COLORS) {
        ctx.strokeStyle = c;
        for (const p of particles) if (p.color === c) drawTrail(p);
      }
      for (const p of particles) drawHead(p);
      rafId = requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };
    const heroVisible = () => hero.getBoundingClientRect().bottom > innerHeight * 0.12;

    measure();
    particles = Array.from({ length: cap() }, (_, i) => spawn({}, i / cap())); // even stagger → continuous stream
    canvas.style.opacity = "1";
    start();

    new IntersectionObserver(
      ([e]) => (e.isIntersecting && e.intersectionRatio > 0.12 ? !document.hidden && start() : stop()),
      { threshold: [0, 0.12] }
    ).observe(hero);
    if (LITE) {
      let atTop = true; // motes freeze as soon as the page starts moving (canvas keeps its last frame)
      addEventListener("scroll", () => {
        const now = scrollY < innerHeight * 0.05;
        if (now === atTop) return;
        atTop = now;
        if (now) { if (!document.hidden) start(); } else stop();
      }, { passive: true });
    }
    document.addEventListener("visibilitychange", () =>
      document.hidden ? stop() : heroVisible() && start()
    );
    let rt;
    addEventListener(
      "resize",
      () => {
        clearTimeout(rt);
        rt = setTimeout(() => {
          measure();
          if (particles.length !== cap()) {
            particles = Array.from({ length: cap() }, (_, i) => spawn({}, i / cap())); // even stagger → continuous stream
          }
        }, 150);
      },
      { passive: true }
    );
  }

  /* optional moving nebula: attaches a source only if the file exists,
     then crossfades over the still poster (Asme seamless-loop feel).
     Drop /public/dream/hero.webm (or .mp4) to activate. Reduced-gated. */
  function initHeroVideo() {
    const video = q(".it-hero-video");
    if (!video) return;
    // mobile now gets the moving vortex too (Dennis, Jul 2026) — the cube
    // is pinned to its base there, so the tip movement is the point.
    // webm is ~1.9MB; reduced-motion users never reach this module at all.
    // VP9 (webm) is the smaller file, but only the cheaper one where the GPU decodes it: without hardware
    // VP9 (Intel before Kaby Lake, older AMD, older Macs) the loop is software-decoded on the CPU for the
    // whole first screen, and the H.264 mp4 (hardware-decoded nearly everywhere) is the lighter pick.
    // mediaCapabilities.decodingInfo knows which; where the API is missing, the canPlayType pick stands.
    // The decision is exposed on the element: data-codec = vp9 | h264, data-codec-why = the reason.
    const pickCodec = async () => {
      let ext = "webm", why = "vp9";
      if (!video.canPlayType('video/webm; codecs="vp9"')) { ext = "mp4"; why = "no-vp9"; }
      else if (navigator.mediaCapabilities?.decodingInfo) {
        const cfg = LITE
          ? { contentType: 'video/webm; codecs="vp09.00.31.08"', width: 1280, height: 720, bitrate: 720000, framerate: 24 }
          : { contentType: 'video/webm; codecs="vp09.00.40.08"', width: 2444, height: 1376, bitrate: 1500000, framerate: 24 };
        try {
          // bounded: a slow answer must not hold the hero back (the poster is up; the loop dissolves in when it plays)
          const info = await Promise.race([
            navigator.mediaCapabilities.decodingInfo({ type: "file", video: cfg }),
            new Promise((r) => setTimeout(() => r(null), 400)),
          ]);
          if (!info) why = "vp9-timeout";
          else if (!info.supported) { ext = "mp4"; why = "vp9-unsupported"; }
          else if (!info.powerEfficient) { ext = "mp4"; why = "vp9-software"; }
          else why = "vp9-hardware";
        } catch { why = "vp9-mc-error"; }
      } else why = "vp9-no-mediacapabilities";
      video.dataset.codec = ext === "mp4" ? "h264" : "vp9";
      video.dataset.codecWhy = why;
      return ext;
    };
    const tryAttach = async () => {
      // phones: a 1280x720 re-encode (same frames, about half the bytes, a quarter of the pixels to decode); it ships
      // with the site, not the CDN. Picked by canPlayType alone, as before: no decode probe on the phone path.
      if (LITE) {
        const ext = video.canPlayType('video/webm; codecs="vp9"') ? "webm" : "mp4";
        video.dataset.codec = ext === "mp4" ? "h264" : "vp9";
        video.dataset.codecWhy = "lite";
        return "/dream/hero-m." + ext;
      }
      const ext = await pickCodec();
      // CDN copy: no HEAD probe (cross-origin, and the file is known to exist); pick by codec support
      if (MEDIA_BASE) return media("/dream/hero." + ext);
      for (const src of ext === "mp4" ? ["/dream/hero.mp4", "/dream/hero.webm"] : ["/dream/hero.webm", "/dream/hero.mp4"]) {
        try {
          const res = await fetch(src, { method: "HEAD" });
          // require a real video — the dev server serves index.html (200,
          // text/html) for missing paths, so res.ok alone is a false positive
          if (res.ok && (res.headers.get("content-type") || "").startsWith("video/")) return src;
        } catch {
          /* missing file — fall through to the still poster */
        }
      }
      return null;
    };
    tryAttach().then((src) => {
      if (!src) return; // no file → still poster stays, silently
      video.src = src;
      video.addEventListener(
        "canplay",
        () => {
          video.play().catch(() => {});
          // fade only once frames are actually rendering (not merely ready) —
          // and from the next frame, so the 2.2s dissolve always animates
          video.addEventListener(
            "playing",
            () => requestAnimationFrame(() => requestAnimationFrame(() => { video.style.opacity = "1"; })),
            { once: true }
          );
          // recomposite nudge: mix-blend-mode over an accelerated <video>
          // can fail to blend until the next repaint (the cube's baked navy
          // ground shows as a dark box until the first scroll). Poking the
          // cube's layer forces the compositor to rebuild the blend group.
          const cubeEl = q(".it-cube");
          if (cubeEl) {
            requestAnimationFrame(() => {
              gsap.set(cubeEl, { z: 0.01 });
              requestAnimationFrame(() => gsap.set(cubeEl, { z: 0 }));
            });
          }
          // don't burn frames while the hero is off-screen or tab hidden
          const hero = q(".it-hero");
          if (hero) {
            new IntersectionObserver(
              ([e]) => (e.isIntersecting && !document.hidden ? video.play().catch(() => {}) : video.pause()),
              { threshold: 0 }
            ).observe(hero);
          }
          if (LITE) {
            // the cube leaves across the vortex as soon as the page moves: freeze the video's decode +
            // its screen-blend recomposite for that stretch (the last frame stays up)
            let atTop = true;
            addEventListener("scroll", () => {
              const now = scrollY < innerHeight * 0.05;
              if (now === atTop) return;
              atTop = now;
              if (now) video.play().catch(() => {}); else video.pause();
            }, { passive: true });
          }
          document.addEventListener("visibilitychange", () => {
            if (document.hidden) return video.pause();
            if (hero && hero.getBoundingClientRect().bottom > 0) video.play().catch(() => {});
          });
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          video.removeAttribute("src"); // decode failed → keep the still
          video.style.opacity = "0";
        },
        { once: true }
      );
      video.load();
    });
  }

  function startHeroLoops() {
    // gentle float — small travel, sine, never a spin.
    // lives on the stack inside the figure so the figure's scrub choreography
    // (xPercent/scale/rotation) never fights it. One box for all three frames
    // (Oct 25 2026): it used to write three transforms per frame, two of them
    // on frames that were invisible at the time.
    gsap.to(".it-cube-stack", {
      y: 10,
      rotation: 1.3,
      duration: 4.4,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });

    // tofu jiggle: every few seconds a soft squash + elastic wobble back,
    // anchored near the base (poked-tofu physics), with a synced glow
    // surge (brightness reads as light through the screen blend).
    // Random cadence like the buddy's idle pool — alive, not mechanical.
    {
      const media = qa(".it-cube-stack"); // the shared motion box: open, blink and joy squish together
      const cube = q(".it-cube");
      if (media.length) {
        let jt;         // pending idle timeout
        let active;     // currently-running jiggle timeline
        // poke = true → a livelier squash + brighter surge for click feedback
        const jiggle = (poke = false) => {
          // poke values are deliberately louder than the idle wobble — click
          // feedback competes with the joy-face swap for attention, so it
          // needs to be unmistakable (1.09/0.88 read as nothing next to it)
          const sx = poke ? 1.16 : 1.045;
          const sy = poke ? 0.8 : 0.95;
          const surge = poke ? 1.3 : 1.13;
          active = gsap
            .timeline()
            .to(media, {
              scaleX: sx, scaleY: sy, transformOrigin: "50% 76%",
              duration: poke ? 0.13 : 0.16, ease: "power2.in",
            })
            .to(media, {
              scaleX: 1, scaleY: 1,
              duration: poke ? 1.5 : 1.35, ease: poke ? "elastic.out(1.2, 0.22)" : "elastic.out(1.1, 0.26)",
            })
            .fromTo(media, { filter: "brightness(1)" },
              { filter: `brightness(${surge})`, duration: 0.2, ease: "power2.out" }, 0)
            .to(media, { filter: "brightness(1)", duration: 1, ease: "sine.out" }, 0.24);
          return active;
        };
        // idle loop: a soft wobble every few seconds, like the buddy's idle
        // pool — alive, not mechanical
        const schedule = () => { jt = setTimeout(tick, gsap.utils.random(3200, 5800)); };
        const tick = () => {
          if (document.hidden || !cubeOn() || (LITE && scrollY > 24)) return schedule();   // nobody can see the cube: no wobble
          jiggle(false).eventCallback("onComplete", schedule);
        };
        schedule();

        // poke the tofu on click — deeper squish + a flash of the joy face,
        // and reset the idle timer so it doesn't double-fire right after
        // (no stacked schedule loops)
        if (cube) {
          const joyImg = q(".it-cube-joy");
          const openImg = q(".it-cube-media:not(.it-cube-blink):not(.it-cube-joy)");
          const blinkImg = q(".it-cube-blink");
          let lastPokeTs = -1;
          const pokeNow = (ts) => {
            if (ts === lastPokeTs) return; // direct + fallback both fired for one click
            lastPokeTs = ts;
            clearTimeout(jt);
            active?.kill();
            jiggle(true).eventCallback("onComplete", schedule);
            // crossfade to the happy ≧◡≦ face for the length of the poke, then
            // settle back. because every frame is mix-blend-mode: screen, the
            // frames ADD rather than occlude — so the calm + blink faces must
            // be faded fully out or two faces ghost together. no-ops if the
            // asset is missing (onerror removed it).
            if (joyImg && joyImg.isConnected && joyImg.naturalWidth) {
              gsap.to(joyImg, { opacity: 1, duration: 0.14, ease: "sine.out", overwrite: "auto" });
              if (openImg) gsap.to(openImg, { opacity: 0, duration: 0.14, ease: "sine.out", overwrite: "auto" });
              if (blinkImg) gsap.to(blinkImg, { opacity: 0, duration: 0.14, ease: "sine.out", overwrite: "auto" });
              // settle back to the calm face. overwrite "auto" (not true): true kills
              // EVERY tween on these imgs, incl. the squash/float/parallax, so the
              // poke jiggle died on the frame it started.
              gsap.to(joyImg, { opacity: 0, duration: 0.45, ease: "sine.inOut", delay: 0.95 });
              if (openImg) gsap.to(openImg, { opacity: 1, duration: 0.45, ease: "sine.inOut", delay: 0.95 });
            }
          };
          cube.addEventListener("pointerdown", (e) => pokeNow(e.timeStamp));
          // safety net: on some setups an overlay quietly eats the cube's
          // clicks (zoom/aspect-dependent). Hit-test the cube's box at the
          // document level too — poke is decorative feedback, so a generous
          // hit zone is harmless, and lastPokeTs prevents double-firing.
          // capture phase: runs top-down from the document BEFORE any element
          // (or extension overlay) can stopPropagation the event away from us
          document.addEventListener("pointerdown", (e) => {
            const r = cube.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
            if (parseFloat(getComputedStyle(cube).opacity) < 0.25) return; // mid-journey, cube faded out
            pokeNow(e.timeStamp);
          }, { capture: true });
        }
      }
    }

    /* blink: crossfade to the closed-eye render on a calm cadence —
       slow close, a proper serene hold, gentle open. 20% of blinks hold
       extra long (deep-calm tofu). Activates only if the asset exists. */
    {
      const blinkImg = q(".it-cube-blink");
      const openImg = q(".it-cube-media:not(.it-cube-blink)");
      if (blinkImg && openImg) {
        let bt;
        const scheduleBlink = () => { bt = setTimeout(blink, gsap.utils.random(4500, 8500)); };
        const blink = () => {
          if (document.hidden || !cubeOn() || !blinkImg.isConnected || !blinkImg.naturalWidth) return scheduleBlink();
          const hold = Math.random() < 0.2 ? 1.3 : 0.6; // occasional deep calm
          gsap.timeline({ onComplete: scheduleBlink })
            // true crossfade: the open frame fully steps aside so its eyes
            // can't ghost through the closed frame
            .to(blinkImg, { opacity: 1, duration: 0.18, ease: "sine.in" }, 0)
            .to(openImg, { opacity: 0, duration: 0.18, ease: "sine.in" }, 0)
            .to(blinkImg, { opacity: 0, duration: 0.32, ease: "sine.out" }, `+=${hold}`)
            .to(openImg, { opacity: 1, duration: 0.32, ease: "sine.out" }, `-=0.32`);
        };
        scheduleBlink();
      }
    }

    startHeroAura();
    initHeroVideo();

    // rotating word in the sub line — container width follows each word
    const rotate = q(".it-rotate");
    const words = qa(".it-rotate-word");
    if (rotate && words.length > 1) {
      const widths = words.map((w) => w.offsetWidth);
      words.forEach((w) => w.classList.remove("is-on"));
      gsap.set(words, { autoAlpha: 0, y: 14 });
      gsap.set(words[0], { autoAlpha: 1, y: 0 });
      gsap.set(rotate, { width: widths[0] });
      let i = 0;
      setInterval(() => {
        if (document.hidden || !isOn("hero")) return;   // the width tween is a layout; skip it off-screen
        const cur = words[i];
        i = (i + 1) % words.length;
        const nxt = words[i];
        gsap.to(cur, {
          autoAlpha: 0,
          y: -14,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => gsap.set(cur, { y: 14 }),
        });
        gsap.to(rotate, { width: widths[i], duration: 0.4, ease: "power2.inOut", delay: 0.1 });
        gsap.to(nxt, { autoAlpha: 1, y: 0, duration: 0.4, ease: "power2.out", delay: 0.28 });
      }, 2600);
    }

    // cursor parallax on the hero (fine pointers only)
    if (matchMedia("(pointer: fine)").matches) {
      const mx = gsap.quickTo(".it-cube-stack", "x", { duration: 0.9, ease: "power3" });
      const ax = gsap.quickTo(".it-hero .it-aura", "x", { duration: 1.2, ease: "power3" });
      q(".it-hero")?.addEventListener("pointermove", (e) => {
        const n = e.clientX / innerWidth - 0.5;
        mx(n * 18);
        ax(n * -12);
      });
    }
  }

  /* ---------------- hero scroll-out ---------------- */

  // cosmos drifts with the scroll (constant overscale hides the travel)
  // (phones skip both parallaxes: they re-scale a 1000px+ image and re-position the text on every scroll
  // frame, right while the cube is travelling across the same screen)
  if (!LITE) {
    gsap.fromTo(
      ".it-hero-cosmos img",
      { yPercent: -5, scale: 1.12 },
      {
        yPercent: 5,
        scale: 1.12,
        ease: "none",
        scrollTrigger: { trigger: ".it-hero", start: "top top", end: "bottom top", scrub: true },
      }
    );
    gsap.to(".it-hero-text", {
      yPercent: -7,
      ease: "none",
      scrollTrigger: { trigger: ".it-hero", start: "top top", end: "bottom top", scrub: true },
    });
  }
  ScrollTrigger.create({
    start: 80,
    onEnter: () => gsap.to(".it-scroll-cue", { autoAlpha: 0, duration: 0.4, overwrite: "auto" }),
    onLeaveBack: () =>
      gsap.to(".it-scroll-cue", { autoAlpha: 1, duration: 0.4, overwrite: "auto" }),
  });

  /* ---------------- intro: scrubbed word reveal + bloom draw ---------------- */

  const statement = q(".it-statement");
  if (statement) {
    splitWords(statement, wrapScrub);
    // phones: the words fade in on a short timed stagger when the paragraph arrives, instead of
    // being tied to the scroll position (a per-word opacity write on every scroll frame)
    if (GECKO) {
      // Firefox phones: same staggered fade, as CSS transitions (compositor-run, no tile redraw)
      qa(".it-sw", statement).forEach((w, i) => { w.style.transitionDelay = (i * 0.045).toFixed(3) + "s"; });
      statement.classList.add("gk-stmt");
      ScrollTrigger.create({ trigger: statement, start: "top 82%", once: true, onEnter: () => statement.classList.add("is-in") });
    } else
    gsap.to(qa(".it-sw", statement), LITE ? {
      opacity: 1, ease: "power1.out", duration: 0.4, stagger: 0.045,
      scrollTrigger: { trigger: statement, start: "top 82%", once: true },
    } : {
      opacity: 1,
      ease: "none",
      stagger: 1,
      scrollTrigger: {
        trigger: statement,
        start: "top 82%",
        end: "top 30%",
        scrub: true,
      },
    });
  }

  const bloom = q(".it-intro-bloom");
  if (bloom) {
    const stem = qa(".it-stem", bloom);
    const leaf = qa(".it-leaf", bloom);
    const shell = qa(".it-pod-shell", bloom);
    const beans = qa(".it-bean", bloom);
    prepDraw([...stem, ...leaf, ...shell]);
    gsap.set(beans, { scale: 0 });
    gsap
      .timeline({
        scrollTrigger: LITE ? { trigger: ".it-intro", start: "top 70%", once: true } : { trigger: ".it-intro", start: "top 70%", end: "center 40%", scrub: 1 },
      })
      .to(stem, { strokeDashoffset: 0, duration: 1, ease: "none" })
      .to(leaf, { strokeDashoffset: 0, duration: 0.6, ease: "none" }, "-=0.35")
      .to(shell, { strokeDashoffset: 0, duration: 0.5, ease: "none" }, "-=0.2")
      .to(beans, { scale: 1, duration: 0.4, ease: "none", stagger: 0.12 }, "-=0.15");
  }

  /* intro doodle: the headline literalized — bean draws, gets pressed,
     becomes the cube; each step labels itself as the scrub passes */
  const doodle = q(".it-intro-doodle");
  if (doodle) {
    const dBean = qa(".it-dd-bean", doodle);
    const dArr1 = qa(".it-dd-arrow-1 path", doodle);
    const dPress = qa(".it-dd-press, .it-dd-block", doodle);
    const dArr2 = qa(".it-dd-arrow-2 path", doodle);
    const dCube = qa(".it-dd-cube", doodle);
    prepDraw([...dBean, ...dArr1, ...dPress, ...dArr2, ...dCube]);
    const dFace = qa(".it-dd-face", doodle);
    const dLabels = qa(".it-dd-label", doodle);
    gsap.set(dFace, { scale: 0 });
    gsap.set(dLabels, { autoAlpha: 0 });
    gsap
      .timeline({
        scrollTrigger: LITE ? { trigger: ".it-intro", start: "top 52%", once: true } : { trigger: ".it-intro", start: "top 52%", end: "center 26%", scrub: 1 },
      })
      .to(dBean, { strokeDashoffset: 0, duration: 0.5, ease: "none" })
      .to(dLabels[0], { autoAlpha: 1, duration: 0.15 }, "<0.3")
      .to(dArr1, { strokeDashoffset: 0, duration: 0.3, ease: "none" })
      .to(dPress, { strokeDashoffset: 0, duration: 0.6, ease: "none" })
      .to(dLabels[1], { autoAlpha: 1, duration: 0.15 }, "<0.4")
      .to(dArr2, { strokeDashoffset: 0, duration: 0.3, ease: "none" })
      .to(dCube, { strokeDashoffset: 0, duration: 0.5, ease: "none" })
      .to(dFace, { scale: 1, duration: 0.3, ease: "none" })
      .to(dLabels[2], { autoAlpha: 1, duration: 0.15 }, "<0.1");
  }

  /* ---------------- studio: tofu fades in, then supervises the deploy ---------------- */
  /* Sequence: aura blooms → tofu resolves out of a soft blur while the
     figure settles up → glass terminal slides in → typing starts.
     Waits for the lazy mascot image so the fade never runs on an empty
     <img>. Transform lives on the <figure> (the img's CSS float owns its
     own transform). Reduced motion never runs this module, so the static
     render + pre-filled terminal stay as-is. */

  const studioFig = q(".it-studio-mascot");
  if (studioFig) {
    const tofu = q(".it-mascot-media", studioFig);
    const aura = q(".it-aura", studioFig);
    const dep = q(".it-deploy", studioFig);
    const depLines = dep ? qa(".it-dep-line", dep) : [];
    const depTexts = depLines.map((l) => l.textContent);
    depLines.forEach((l) => (l.textContent = ""));

    const squish = q(".it-mascot-squish", studioFig);
    // the supervisor approves: one squish + brightness pop on "✓ fresh & firm"
    const celebrate = () => {
      if (!squish) return;
      gsap.timeline()
        .to(squish, { scaleX: 1.08, scaleY: 0.9, filter: "brightness(1.18)", duration: 0.16, ease: "power2.in" })
        .to(squish, { scaleX: 1, scaleY: 1, duration: 0.9, ease: "elastic.out(1, 0.42)", clearProps: "transform" })
        .to(squish, { filter: "brightness(1)", duration: 0.7, ease: "power2.out", clearProps: "filter" }, "<0.1");
    };

    const typeDeploy = () => {
      let li = 0;
      const typeLine = () => {
        if (li >= depLines.length) return celebrate();
        const el = depLines[li], txt = depTexts[li];
        let ci = 0;
        const iv = setInterval(() => {
          el.textContent = txt.slice(0, ++ci);
          if (ci >= txt.length) {
            clearInterval(iv);
            li++;
            // "pressing…" holds a beat before the ✓ lands
            setTimeout(typeLine, li === 2 ? 900 : 450);
          }
        }, li === 1 ? 55 : 32);
      };
      setTimeout(typeLine, 250);
    };

    const tl = gsap.timeline({ paused: true, onComplete: typeDeploy });
    // clearProps: "all" hands every element back to its stylesheet when done.
    // Leftover inline transforms keep the figure/aura on their own GPU layer,
    // which clips the aura's 72px blur into a visible hard-edged box.
    if (aura) tl.from(aura, { autoAlpha: 0, scale: 0.85, duration: 1.6, ease: "power2.out", clearProps: "all" }, 0);
    tl.from(studioFig, { y: 40, duration: 1.5, ease: "power3.out", clearProps: "all" }, 0.1)
      .from(tofu, { autoAlpha: 0, filter: "blur(14px)", duration: 1.3, ease: "power2.out", clearProps: "all" }, 0.15);
    if (dep) tl.from(dep, { autoAlpha: 0, y: 18, duration: 0.7, ease: "power2.out", clearProps: "all" }, 0.95);
    tl.progress(0); // paint the hidden start state now, not on enter

    const play = () => {
      if (tofu.complete && tofu.naturalWidth) return tl.play();
      const go = () => tl.play();
      tofu.addEventListener("load", go, { once: true });
      tofu.addEventListener("error", go, { once: true });
      setTimeout(go, 2500); // never strand it hidden on a slow network
    };

    ScrollTrigger.create({ trigger: studioFig, start: "top 75%", once: true, onEnter: play });
  }

  /* ---------------- masked word reveals for headings ---------------- */

  qa("[data-split]").forEach((el) => {
    if (el === statement) return;
    splitWords(el, wrapMask);
    const inners = qa(".it-w-in", el);
    if (GECKO) {
      const step = inners.length > 1 ? 0.4 / (inners.length - 1) : 0;   // stagger { amount: 0.4 }, as below
      inners.forEach((w, i) => { w.style.transitionDelay = (i * step).toFixed(3) + "s"; });
      el.classList.add("gk-split");
      ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => el.classList.add("is-in") });
      return;
    }
    gsap.set(inners, { yPercent: 118 });
    gsap.to(inners, {
      yPercent: 0,
      duration: 0.85,
      stagger: { amount: 0.4 },
      scrollTrigger: { trigger: el, start: "top 85%", once: true },
    });
  });

  /* ---------------- generic reveals ---------------- */

  qa("[data-reveal]").forEach((el) => {
    if (el.closest(".it-hero")) return; // hero handles its own entrance
    if (GECKO) {
      el.classList.add("gk-rv");
      ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => el.classList.add("is-in") });
      return;
    }
    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 34 },
      {
        autoAlpha: 1,
        y: 0,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
      }
    );
  });

  /* ---------------- services: scene windows ---------------- */
  // each still drifts a little as it crosses the viewport (the window is
  // a view into a place, not a sticker). CSS owns `scale`; GSAP owns
  // transform, so the two compose instead of fighting.
  if (!GECKO) qa(".it-tile-scene img, .it-tile-scene canvas").forEach((img) => {   // (Firefox phones: no scrubbed parallax)
    const box = img.closest(".it-tile");
    gsap.fromTo(
      img,
      { yPercent: -5 },
      {
        yPercent: 5,
        ease: "none",
        scrollTrigger: { trigger: box, start: "top bottom", end: "bottom top", scrub: true },
      }
    );
  });
  // cursor light: a cream pool follows the pointer across the glass
  // (hover devices only; touch gets the still aura)
  if (matchMedia("(hover: hover)").matches) {
    qa("[data-tiles] .it-tile").forEach((tile) => {
      tile.addEventListener("pointermove", (e) => {
        const r = tile.getBoundingClientRect();
        tile.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        tile.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    });
  }

  /* ---------------- dream media: slow scroll drift ---------------- */
  // duo image only — the feature image is owned by the desktop pin
  // timeline (or by the mobile mm block, where it stays in flow).
  qa(".it-dream-duo-media img").forEach((img) => {
    gsap.fromTo(
      img,
      { yPercent: -6, scale: 1.14 },
      {
        yPercent: 6,
        scale: 1.14,
        ease: "none",
        scrollTrigger: {
          trigger: img.closest(".it-dream-media"),
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      }
    );
  });

  /* ---------------- responsive scroll scenes ---------------- */

  const mm = gsap.matchMedia();

  // desktop: cube journey + pinned horizontal work gallery + pinned parallax playground
  mm.add("(min-width: 900px)", () => {
    /* --- RZV-style cube journey (triggers created in page order) --- */
    const cube = q(".it-cube");
    if (cube) {
      cube.classList.add("is-fixed");
      gsap.set(cube, { rotation: -8 });

      // pin the cube to the vortex base (video glow) at any aspect ratio —
      // cover-crop shifts the glow around, so CSS %s alone can't hold it
      const heroEl = q(".it-hero");
      const WIDE_MQ = matchMedia("(min-width: 900px)"); // one live list (the ticker used to build a new one per frame)
      let heroS = 0; // the hero video's cover-crop scale, refreshed with placeCube (was read from layout every frame)
      const placeCube = () => {
        // resize listeners outlive the matchMedia block — never let the
        // desktop pose stomp the mobile glow-pinned cube
        if (!heroEl || !WIDE_MQ.matches) return;
        const hw = heroEl.clientWidth, hh = heroEl.clientHeight;
        heroS = Math.max(hw / GLOW.vw, hh / GLOW.vh);
        const g = glowPoint(hw, hh);
        // cube center sits just above the glow → the glow lights the cube
        // from within and the vortex erupts out of its top face
        const cy = g.y - cube.offsetWidth * 0.1;
        gsap.set(cube, { left: g.x, top: cy });
        // the aura is the cube's ambient light — it travels with it
        // (fixes the dark pocket of video sky around the rest pose)
        const aura = q(".it-hero .it-aura");
        if (aura) gsap.set(aura, { left: g.x, top: cy });
      };
      placeCube();
      let crt;
      addEventListener(
        "resize",
        () => { clearTimeout(crt); crt = setTimeout(placeCube, 120); },
        { passive: true }
      );

      // the cube rides the vortex tip sway (TIP_SWAY, hoisted to module
      // scope), synced to the video clock, so it feels physically attached
      // to the stream.
      const vid = q(".it-hero-video");
      // This runs every frame of the first screen, so (Oct 2026, desktop smoothness pass) it reads nothing
      // from layout: scrollY / innerHeight / clientWidth each forced a style + layout flush mid-frame, right
      // after GSAP's writes (the per-frame UpdateLayoutTree in the hero traces), and gsap.set() built a tween
      // per frame. Now: cached scroll position + viewport height, the hero scale from placeCube, and a
      // quickSetter with the same 0.05px gate as the mobile ticker. Same x, same cadence.
      let sy = scrollY, vh = innerHeight;
      addEventListener("scroll", () => { sy = scrollY; }, { passive: true });
      addEventListener("resize", () => { vh = innerHeight; }, { passive: true });
      const setSwayX = gsap.quickSetter(cube, "x", "px");
      let lastSwayX = 1e9;
      gsap.ticker.add(() => {
        if (!vid || !vid.currentSrc || vid.paused || !heroEl || !heroS) return;
        // the video now also plays on mobile — this desktop ticker must
        // yield there (the mobile block runs its own with extended-box math)
        if (!WIDE_MQ.matches) return;
        // sway only matters while the hero is on screen — past it, x belongs
        // to the scroll choreography (this used to stomp it every frame)
        if (sy > vh * 0.9) return;
        const n = TIP_SWAY.length;
        const i = ((vid.currentTime % LOOP_DUR) / LOOP_DUR) * n;
        const a = TIP_SWAY[Math.floor(i) % n];
        const b = TIP_SWAY[Math.ceil(i) % n];
        const off = a + (b - a) * (i - Math.floor(i));
        const px = off * GLOW.vw * heroS * 1.6; // ×1.6 = perceptible, still subtle
        if (Math.abs(px - lastSwayX) < 0.05) return;
        lastSwayX = px;
        setSwayX(px);
      });

      // hero-out: zoom out, drift aside, rotate −8° → +32° (Δ40°, never 360°).
      // Journey ends EARLY (hero bottom at 25% viewport ≈ the moment Hello
      // settles) so the cube is already parked when the section reads —
      // hugging the right edge, vertically centered (Dennis pick, Jul 2026).
      // Function-based targets + invalidateOnRefresh keep the park pose
      // right-edge-relative at any viewport (CSS base: left 71% / top 44%).
      const PARK_SCALE = 0.42;
      const PARK_MARGIN = 0.035; // gap between cube and viewport right edge, as vw fraction
      const PARK_CONTENT_GAP = 380; // px, headline right edge → cube center; caps the drift on ultrawide
      gsap
        .timeline({
          scrollTrigger: {
            trigger: ".it-hero",
            start: "top top",
            end: "bottom 25%",
            scrub: true,
            invalidateOnRefresh: true,
          },
        })
        .to(
          cube,
          {
            // GSAP owns the CSS translate(-50%,-50%) as xPercent/yPercent −50,
            // and placeCube() sets left/top in px (glow point, NOT 71%/44%) —
            // so targets are: −50 base + measured offset to the park spot.
            xPercent: () => {
              const w = cube.offsetWidth || 1;
              const leftPx = parseFloat(getComputedStyle(cube).left) || innerWidth * 0.71;
              // edge-anchored on laptop widths; on ultrawide the content
              // anchor wins so the cube stays with the Hello column instead
              // of sailing to the far edge
              const edgeX = innerWidth * (1 - PARK_MARGIN) - (w * PARK_SCALE) / 2;
              const stmt = q(".it-intro .it-statement");
              const contentX = stmt
                ? stmt.getBoundingClientRect().right + PARK_CONTENT_GAP
                : edgeX;
              const targetX = Math.min(edgeX, contentX);
              return -50 + ((targetX - leftPx) / w) * 100;
            },
            yPercent: () => {
              const h = cube.offsetHeight || 1;
              const topPx = parseFloat(getComputedStyle(cube).top) || innerHeight * 0.44;
              return -50 + ((innerHeight / 2 - topPx) / h) * 100;
            },
            scale: PARK_SCALE,
            rotation: 32,
            ease: "none",
            duration: 1,
          },
          0
        );

      // …then fades as you scroll past Hello (section bottom 55% → 20%
      // of the viewport). Scrub back up and it returns.
      gsap.to(cube, {
        autoAlpha: 0,
        ease: "none",
        immediateRender: false,
        scrollTrigger: {
          trigger: ".it-intro",
          start: "bottom 55%",
          end: "bottom 20%",
          scrub: true,
        },
      });
    }

    const track = q(".it-work-track");
    const barEl = q(".it-work-progress i");
    if (track) {
      const getDist = () => Math.max(0, track.scrollWidth - innerWidth);
      const scrollTween = gsap.to(track, {
        x: () => -getDist(),
        ease: "none",
        scrollTrigger: {
          trigger: ".it-work",
          start: "top top",
          end: () => "+=" + getDist(),
          scrub: 1,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => barEl && gsap.set(barEl, { scaleX: self.progress }),
        },
      });

      // slight counter-drift inside each card as it travels
      qa(".it-card .it-art-motif").forEach((motif) => {
        gsap.fromTo(
          motif,
          { x: 26 },
          {
            x: -26,
            ease: "none",
            scrollTrigger: {
              containerAnimation: scrollTween,
              trigger: motif.closest(".it-card"),
              start: "left right",
              end: "right left",
              scrub: true,
            },
          }
        );
      });
    }

    /* --- dream: tofu tile → meadow banner → sliver → "Wonder × craft" --- */
    const scene = q(".it-dream-scene");
    if (false && scene) { // retired: old meadow tile→sliver sequence (replaced below)
      const feature = q(".it-dream-feature", scene);
      const media = q(".it-dream-media", feature);
      const img = q("img", media);
      const overlays = [q(".it-dream-card", feature), q(".it-dream-more", feature)];
      const eyes = q(".it-dream-eyes", media);
      const veil = q(".it-dream-veil", media);
      const tvid = q(".it-dream-tofu"); // galaxy tofu video (section-level, fixed)
      const wordL = q(".it-dream-x-left");
      const wordR = q(".it-dream-x-right");
      const glyph = q(".it-dream-x-glyph");

      // function-based clip string — size-dependent, refreshed on resize
      const sliverClip = () => {
        const w = media.offsetWidth;
        const h = media.offsetHeight;
        const sh = Math.min(74, h * 0.14); // thin tilted strip
        return `inset(${(h - sh) / 2}px ${(w - 14) / 2}px round 999px)`;
      };

      const blocks = [q(".it-dream-x-blockL"), q(".it-dream-x-blockR")];
      const sleeper = q(".it-dream-sleeper");

      // galaxy tofu video: floats over the section (screen-blended, no box).
      // starts hidden + centered; the scrub prelude drifts it in beside the
      // copy → center → full, then the pin dissolves it into the meadow.
      // meadow starts hidden so only the glowing tofu shows during the intro.
      if (tvid) {
        tvid.style.display = "block";
        gsap.set(tvid, { xPercent: -50, yPercent: -50, autoAlpha: 0, scale: 0.32 });
        gsap.set(media, { autoAlpha: 0 });
        gsap.set(eyes, { autoAlpha: 0 });
        const pl = tvid.play && tvid.play();
        if (pl && pl.catch) pl.catch(() => {});
      } else {
        gsap.set(media, { autoAlpha: 1 });
        gsap.set(eyes, { autoAlpha: 1 });
      }
      gsap.set(veil, { autoAlpha: 0 });
      gsap.set(overlays, { autoAlpha: 0, y: 26 });
      gsap.set(blocks, { autoAlpha: 0, y: 22 });

      /* sleepy tofu: breathes and snores beside the heading… */
      if (sleeper) {
        const zs = qa(".it-z", sleeper);
        gsap.to(q(".it-sleeper-body", sleeper), {
          scaleY: 1.025,
          duration: 2.2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        // z.. zz.. zzz — each drifts up and fades, staggered forever
        zs.forEach((z, i) => {
          gsap.fromTo(
            z,
            { opacity: 0, y: 6 },
            {
              opacity: 0.85,
              y: -6,
              duration: 1.4,
              ease: "sine.out",
              delay: i * 0.55,
              repeat: -1,
              repeatDelay: 1.65,
              yoyo: true,
              yoyoEase: "sine.in",
            }
          );
        });

        /* …then wakes and drifts to center stage as the scene arrives */
        const stage = q(".it-dream-stage", scene);
        gsap
          .timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: scene,
              start: "top 90%",
              end: "top top",
              scrub: 1,
              invalidateOnRefresh: true,
            },
          })
          .to(sleeper, {
            x: () => {
              const st = stage.getBoundingClientRect();
              const sl = sleeper.getBoundingClientRect();
              return st.left + st.width / 2 - (sl.left + sl.width / 2);
            },
            y: () => {
              const st = stage.getBoundingClientRect();
              const sl = sleeper.getBoundingClientRect();
              return st.top + st.height / 2 - (sl.top + sl.height / 2);
            },
            duration: 1,
          }, 0)
          .to(qa(".it-z, .it-sleeper-bubble", sleeper), { autoAlpha: 0, duration: 0.25 }, 0.15)
          // eyes open, dreamy
          .set(q(".it-sleeper-eyes-sleep", sleeper), { visibility: "hidden" }, 0.55)
          .set(q(".it-sleeper-eyes-dreamy", sleeper), { visibility: "visible" }, 0.55)
          // lands where the tile fades in
          .to(sleeper, { autoAlpha: 0, duration: 0.12 }, 0.88);
      }

      // intro prelude: the tofu floats in beside the copy, then drifts to
      // center and grows to full — a scrub that ends exactly as the scene pins.
      if (tvid) {
        gsap
          .timeline({
            scrollTrigger: {
              trigger: scene,
              start: "top 88%",
              end: "top top",
              scrub: 1,
              invalidateOnRefresh: true,
            },
          })
          .fromTo(
            tvid,
            { autoAlpha: 0, scale: 0.34, x: () => innerWidth * 0.2, y: () => -innerHeight * 0.05 },
            { autoAlpha: 1, scale: 1, x: 0, y: 0, ease: "none", duration: 1 }
          );
      }

      gsap
        .timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: scene,
            start: "top top",
            end: "+=320%",
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        })
        /* intro dissolve — the galaxy tofu pushes in and melts into the
           dreamscape; the meadow zooms up softly behind it */
        .to(tvid || {}, { scale: 1.16, autoAlpha: 0, duration: 0.12 }, 0.02)
        .fromTo(media, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 0.06)
        .fromTo(img, { scale: 1.2 }, { scale: 1.08, duration: 0.3 }, 0.04)
        .to(overlays, { autoAlpha: 1, y: 0, duration: 0.08, stagger: 0.03 }, 0.3)
        /* dwell — the meadow breathes */
        .to(img, { yPercent: 3, duration: 0.42 }, 0.38)
        /* phase 2 — collapse to a tilted sliver (≤20°, never a spin) */
        .to(overlays, { autoAlpha: 0, y: -18, duration: 0.06 }, 0.5)
        .to(media, { clipPath: sliverClip, duration: 0.25 }, 0.53)
        .fromTo(feature, { rotation: 0 }, { rotation: 20, duration: 0.25 }, 0.53)
        /* the words arrive on either side */
        .fromTo(wordL, { xPercent: -55, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.18 }, 0.62)
        .fromTo(wordR, { xPercent: 55, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.18 }, 0.64)
        /* sliver hands off to the real × glyph */
        .fromTo(glyph, { autoAlpha: 0, rotation: -8 }, { autoAlpha: 1, rotation: 0, duration: 0.1 }, 0.8)
        .to(media, { autoAlpha: 0, duration: 0.08 }, 0.82)
        /* finale — the two truths split to their sides */
        .to(blocks[0], { autoAlpha: 1, y: 0, duration: 0.12 }, 0.84)
        .to(blocks[1], { autoAlpha: 1, y: 0, duration: 0.12 }, 0.87);
    }

    /* --- AFTER DARK: ported dream sequence — sleeping tofu in its galaxy →
       wonder × craft cards → wakes into the transparent dreaming tofu over the
       cosmos → punchline. Scroll-scrubbed; canvas drives the galaxy ring with
       front/back depth so the tofu sits inside the ring. --- */
    // (After-dark dream scene moved OUT of this desktop-only block —
    //  it now runs at ALL widths; see the initializer after the mm blocks.)

    // (footer return removed Oct 2026, Dennis call: the cube now stays
    //  gone after it fades past Hello.)

    // resize across the 900px boundary: mm auto-reverts tweens/triggers;
    // classes and leftover inline transforms need manual cleanup
    return () => {
      cube?.classList.remove("is-fixed");
      if (cube) gsap.set(cube, { clearProps: "all" });
      const dreamBits = qa(
        ".it-dream-media, .it-dream-media img, .it-dream-feature, .it-dream-eyes, .it-dream-veil, .it-dream-card, .it-dream-more, .it-dream-x-word, .it-dream-x-glyph, .it-dream-x-block, .it-dream-sleeper"
      );
      if (dreamBits.length) gsap.set(dreamBits, { clearProps: "all" });
    };
  });

  // mobile: simple staggered card + tile reveals instead of pinning
  mm.add("(max-width: 899px)", () => {
    /* --- hero: desktop-like composition (Dennis, Jul 2026) ---
       swirl frame recentered on the cube via object-position, cube pinned
       to the vortex base (glow point on the CSS-extended media box),
       copy bottom-anchored (cube is out of flow now). */
    const heroEl = q(".it-hero");
    const cube = q(".it-cube");
    if (heroEl && cube) {
      let mobS = 0; // media scale, cached for the sway ticker
      const placeMobile = () => {
        if (!matchMedia("(max-width: 899px)").matches) return; // symmetric guard
        const w = heroEl.clientWidth;
        const h = heroEl.clientHeight;
        // zoomed-out framing: the frame is Z viewport-widths wide — as
        // small as possible (more vortex visible) while the frame still
        // reaches the hero top (0.7·Hd must cover the glow line)
        const gy = MOB_GLOW_Y * h; // glow's on-screen y (shared with the mote system)
        const Z = Math.max(2.3, (gy / (0.7 * (GLOW.vh / GLOW.vw))) / w + 0.02);
        const Wd = Z * w;
        const Hd = Wd * (GLOW.vh / GLOW.vw);
        mobS = Wd / GLOW.vw;
        const lx = w / 2 - GLOW.x * Wd; // glow x → center line
        const ty = gy - GLOW.y * Hd; // glow y → gy (≤ 0 by construction)
        qa(".it-hero-cosmos img, .it-hero-video").forEach((el) => {
          el.style.width = `${Wd.toFixed(1)}px`;
          el.style.height = `${Hd.toFixed(1)}px`;
          el.style.left = `${lx.toFixed(1)}px`;
          el.style.top = `${ty.toFixed(1)}px`;
        });
        // cube center just above the glow — same convention as desktop
        const cy = gy - cube.offsetWidth * 0.1;
        // centering is done EXPLICITLY (inline translate:none + GSAP
        // percents) — whether GSAP folds the stylesheet translate(-50%,-50%)
        // into its transform depends on which set() parses first (the
        // video's recomposite z-nudge races it), so both paths must agree.
        // The stylesheet translate stays as the no-JS/reduced fallback.
        cube.style.translate = "none";
        gsap.set(cube, { left: w / 2, top: cy, xPercent: -50, yPercent: -50 });
        const aura = q(".it-hero .it-aura");
        if (aura) {
          aura.style.translate = "none";
          gsap.set(aura, { left: w / 2, top: cy, xPercent: -50, yPercent: -50 });
        }
      };
      placeMobile();
      let mrt;
      addEventListener(
        "resize",
        () => { clearTimeout(mrt); mrt = setTimeout(placeMobile, 120); },
        { passive: true }
      );

      // tip-sway attach, like desktop — scale from the extended media box
      const vid = q(".it-hero-video");
      // quickSetter + a sub-pixel gate: gsap.set() builds a tween per call, and this runs
      // every frame of the first screen (it was the single biggest main-thread cost there)
      const phoneMQ = matchMedia("(max-width: 899px)");
      const setSwayX = gsap.quickSetter(cube, "x", "px");
      let lastSwayX = 1e9;
      gsap.ticker.add(() => {
        if (!vid || !vid.currentSrc || vid.paused) return;
        if (!phoneMQ.matches) return;
        if (scrollY > innerHeight * 0.9) return;
        if (cube._zz > 0.001) return; // the act-3 wave still owns x (a fast flick back up): don't fight it
        const n = TIP_SWAY.length;
        const i = ((vid.currentTime % LOOP_DUR) / LOOP_DUR) * n;
        const a = TIP_SWAY[Math.floor(i) % n];
        const b = TIP_SWAY[Math.ceil(i) % n];
        const off = a + (b - a) * (i - Math.floor(i));
        if (!mobS) return;
        const px = off * GLOW.vw * mobS * 1.6;
        if (Math.abs(px - lastSwayX) < 0.05) return;
        lastSwayX = px;
        setSwayX(px);
      });
    }

    // three-act journey (Dennis, mobile pass): the cube drifts off stage
    // RIGHT with the hero scroll, pops back in from the right centered in
    // Hello's negative space, then fades as the section leaves.
    // NOTE: xPercent/yPercent base is −50 (explicit centering).
    if (cube) {
      cube.classList.add("is-fixed");

      // acts 1 + 2 as three explicit poses (Oct 24). They used to be two independent tweens with
      // toggleActions: when act 2 started while act 1's glide was still running, its overwrite killed
      // act 1, so scrolling back to the top left the cube parked off the right edge. Now every crossing,
      // either direction, tweens from wherever the cube is to a known pose, so reverse scroll always
      // lands clean. (Timed glides, not scrubs: they run at full rate on this big blended layer.)
      const offX = () => -50 + ((innerWidth * 0.5 + (cube.offsetWidth || 1) * 0.62) / (cube.offsetWidth || 1)) * 100;
      const helloY = () => {
        const ch = cube.offsetHeight || 1;
        const restTop = MOB_GLOW_Y * innerHeight - cube.offsetWidth * 0.1;
        return -50 + ((innerHeight * 0.75 - restTop) / ch) * 100;
      };
      let restPose = null; // the hero pose, read the first time the cube leaves it (after the intro set it)
      const pose = {
        rest: () => restPose,
        off: () => ({ xPercent: offX(), yPercent: restPose ? restPose.yPercent : -50, rotation: 6, scale: 0.92 }),
        hello: () => ({ xPercent: -50, yPercent: helloY(), rotation: -10, scale: 0.78 }),
      };
      const timing = { rest: [0.85, "power2.inOut"], off: [0.85, "power2.inOut"], hello: [1.05, "power3.out"] };
      const go = (name) => {
        if (!restPose) restPose = { xPercent: -50, yPercent: gsap.getProperty(cube, "yPercent"), rotation: gsap.getProperty(cube, "rotation"), scale: gsap.getProperty(cube, "scale") };
        const p = pose[name]();
        if (!p) return;
        gsap.to(cube, { ...p, duration: timing[name][0], ease: timing[name][1], overwrite: "auto" });
      };
      // act 1: leaves the vortex as soon as the page moves (y stays on the glow line; the sway ticker
      // keeps x px until 0.9 vh)
      ScrollTrigger.create({ trigger: ".it-hero", start: "top top-=36", onEnter: () => go("off"), onLeaveBack: () => go("rest") });
      // act 2: pops back in from the right, centred in Hello's negative space (power3.out, no bounce)
      ScrollTrigger.create({ trigger: ".it-intro", start: "top 45%", onEnter: () => go("hello"), onLeaveBack: () => go("off") });

      // act 3
      if (GECKO) {
        // Firefox phones: a timed fade once Hello is mostly past (a scrubbed opacity on this big blended
        // layer is a redraw on every scroll frame there)
        gsap.to(cube, {
          autoAlpha: 0, immediateRender: false, duration: 0.6, ease: "power1.inOut",
          scrollTrigger: { trigger: ".it-intro", start: "bottom 40%", toggleActions: "play none none reverse" },
        });
      } else {
        // act 3 (Dennis, Oct 24): the gap between Hello and the work cards. The tofu hops softly left and
        // right across it, a small rise and settle on every swing, then fades as the first card arrives.
        // Scrubbed, so it retraces cleanly on the way back up. x / y only: act 2 owns
        // xPercent / yPercent / scale / rotation, the float lives on the inner media. Never a spin.
        // One continuous wave, not segment-by-segment tweens: eased segments come to a full stop at every
        // turn, which read as stop-go. Here x is a sine (1.5 swings, narrowing as it goes) so the cube
        // keeps moving through each turn, and y lifts on every swing (|sin|), a soft hop with no bounce.
        // Driven by one scrubbed 0..1 value with a little smoothing, so it reads the same either way.
        const setX = gsap.quickSetter(cube, "x", "px");
        const setY = gsap.quickSetter(cube, "y", "px");
        const wave = { p: 0 };
        const A = () => innerWidth * 0.24; // swing half-width
        const drawWave = () => {
          const p = wave.p, ph = p * Math.PI * 3;            // 1.5 full swings across the gap
          cube._zz = p;                                       // tells the hero sway ticker to keep off x
          setX(-Math.sin(ph) * A() * (1 - 0.45 * p));         // starts left, settles toward centre
          setY(-18 * Math.abs(Math.sin(ph)));                 // a lift on every swing, down at each crossing
        };
        gsap.timeline({
          scrollTrigger: {
            trigger: ".it-intro", start: "bottom bottom",
            endTrigger: ".it-card", end: "top 70%",
            scrub: 0.8, invalidateOnRefresh: true,
          },
        })
          .fromTo(wave, { p: 0 }, { p: 1, duration: 1, ease: "none", onUpdate: drawWave }, 0)
          .fromTo(cube, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.45, ease: "power1.in", immediateRender: false }, 0.55);   // mostly gone before the Work heading
      }
    }

    if (GECKO) qa(".it-card").forEach((c) => c.classList.add("gk-card"));
    else gsap.set(".it-card", { autoAlpha: 0, y: 40 });
    ScrollTrigger.batch(".it-card", {
      start: "top 90%",
      once: true,
      onEnter: (els) => GECKO
        ? els.forEach((c, i) => { c.style.transitionDelay = (i * 0.08).toFixed(2) + "s"; c.classList.add("is-in"); })
        :
        gsap.to(els, {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.08,
          overwrite: true,
        }),
    });

    // resize across the 900px boundary: clear the mobile glow-pin leftovers
    // (inline object-position + cube left/top/x) so the desktop journey
    // starts from clean CSS
    return () => {
      qa(".it-hero-cosmos img, .it-hero-video").forEach((el) => {
        el.style.width = el.style.height = el.style.left = el.style.top = "";
      });
      const c = q(".it-cube");
      if (c) {
        c.classList.remove("is-fixed");
        c.style.translate = "";
        gsap.set(c, { clearProps: "left,top,x" });
      }
      const a = q(".it-hero .it-aura");
      if (a) { a.style.translate = ""; gsap.set(a, { clearProps: "left,top" }); }
    };
  });

  /* ------- After dark: pinned dream scene — ALL widths (Dennis, Jul 2026) -------
     Was desktop-only; mobile now gets the full sleep → wonder × craft → wake
     sequence (layout deltas in the max-width:899px CSS). Created OUTSIDE
     matchMedia so breakpoint flips never tear down the pin; all geometry is
     measured from the stage rect each frame, so it adapts to any size. */
  {
    const dScene = q(".it-dream-scene");
    if (dScene) {
      const dStage = q(".it-dream-stage", dScene);
      const cvBack = q(".it-dream-cvback", dScene);
      const cvFront = q(".it-dream-cvfront", dScene);
      const dStill = q(".it-dream-still", dScene);
      const dCosmos = q(".it-dream-cosmos", dScene);
      const dCalm = q(".it-dream-cosmos-calm", dScene);
      const dBlobs = q(".it-dream-blobs", dScene);
      const dCveil = q(".it-dream-cosmos-veil", dScene);
      const dAlpha = q(".it-dream-alpha", dScene);
      const dLead = q(".it-dream-lead", dScene);
      const dGlyph = q(".it-dream-x-glyph", dScene);
      const dCardW = q('.it-dream-card[data-side="w"]', dScene);
      const dCardC = q('.it-dream-card[data-side="c"]', dScene);
      const dPunch = q(".it-dream-punch", dScene);
      const dBloom = q(".it-dream-bloom", dScene);

      if (dStage && cvBack && cvFront) {
        const ctxB = cvBack.getContext("2d");
        const ctxF = cvFront.getContext("2d");
        [dCosmos, dCalm, dAlpha].forEach((v) => { const p = v && v.play && v.play(); if (p && p.catch) p.catch(() => {}); });

        let W = 0, H = 0;
        const DPR = Math.min(2, window.devicePixelRatio || 1);
        const sizeC = () => {
          const r = dStage.getBoundingClientRect();
          W = r.width; H = r.height;
          [cvBack, cvFront].forEach((c) => { c.width = W * DPR; c.height = H * DPR; });
          ctxB.setTransform(DPR, 0, 0, DPR, 0, 0);
          ctxF.setTransform(DPR, 0, 0, DPR, 0, 0);
        };
        sizeC();
        ScrollTrigger.addEventListener("refreshInit", sizeC);

        const ring = [], motes = [];
        for (let i = 0; i < 150; i++) ring.push({ a: Math.random() * 6.28, r: 0.30 + Math.random() * 0.05, tw: Math.random() * 6.28, sp: 0.6 + Math.random() * 0.8, c: Math.random() < 0.5 ? "#9ed9bf" : "#f3b59c" });
        for (let j = 0; j < 70; j++) motes.push({ a: Math.random() * 6.28, z: Math.random(), c: Math.random() < 0.5 ? "#9ed9bf" : "#f3b59c" });
        // dream-bridge motes: drift from the sleeping tofu into each card —
        // mint toward wonder, peach toward craft (color-coded to the glows)
        const bmotes = [];
        for (let k = 0; k < 16; k++) bmotes.push({ side: k % 2 ? 1 : -1, ph: Math.random(), dur: 2800 + Math.random() * 1600, c: k % 2 ? "#f3b59c" : "#9ed9bf" });

        // aurora curtains: pre-rendered soft ribbon sprites (mint / peach),
        // drawn in vertical slices with a slow sin warp during the wake —
        // the hero's painted aurora sky, live, closing the loop
        const mkRibbon = (color) => {
          const c = document.createElement("canvas");
          c.width = 240; c.height = 900;
          const x = c.getContext("2d");
          const g = x.createLinearGradient(0, 0, 0, 900);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(0.18, color);
          g.addColorStop(0.6, color);
          g.addColorStop(1, "rgba(0,0,0,0)");
          x.fillStyle = g; x.fillRect(0, 0, 240, 900);
          const h = x.createLinearGradient(0, 0, 240, 0);
          h.addColorStop(0, "rgba(0,0,0,0)");
          h.addColorStop(0.5, "rgba(0,0,0,1)");
          h.addColorStop(1, "rgba(0,0,0,0)");
          x.globalCompositeOperation = "destination-in";
          x.fillStyle = h; x.fillRect(0, 0, 240, 900);
          return c;
        };
        const ribbons = [
          { spr: mkRibbon("rgba(158,217,191,0.5)"),  x: 0.16, amp: 46, spd: 5200, ph: 0,   w: 0.16 },
          { spr: mkRibbon("rgba(243,181,156,0.4)"),  x: 0.34, amp: 60, spd: 6800, ph: 2.1, w: 0.13 },
          { spr: mkRibbon("rgba(158,217,191,0.42)"), x: 0.66, amp: 54, spd: 6000, ph: 4.2, w: 0.15 },
          { spr: mkRibbon("rgba(243,181,156,0.36)"), x: 0.84, amp: 44, spd: 7600, ph: 1.1, w: 0.12 },
        ];
        // shooting stars: rare, one at a time, along the ring's tilt
        let shoot = null, nextShoot = 0;
        const TILT = 0.42;
        const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
        const clv = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
        const sg = (u, a, b) => clv((u - a) / (b - a));
        const fd = (u, a, b, c, d) => { if (u < a) return 0; if (u < b) return eio((u - a) / (b - a)); if (u < c) return 1; if (u < d) return 1 - eio((u - c) / (d - c)); return 0; };

        let U = 0, active = false;

        const render = () => {
          if (!active) return;
          const now = performance.now(), u = U;
          ctxB.clearRect(0, 0, W, H); ctxF.clearRect(0, 0, W, H);
          // mobile centers the whole composition (cards stack above/below,
          // so 44% reads top-heavy there) — keep in sync with the CSS
          // .it-dream-still/.it-dream-alpha top values per breakpoint
          const MOB = matchMedia("(max-width: 899px)").matches;
          const cx = W * 0.5, cy = H * (MOB ? 0.5 : 0.44);
          const push = eio(sg(u, 0.28, 0.62)) * 0.4 + eio(sg(u, 0.62, 0.9)) * 0.12;
          const dream = fd(u, 0.58, 0.74, 0.99, 1.0);
          // nebula transitions in AFTER the tofu + galaxy ring establish, then
          // intensifies into the punchline. gentle scale drift adds depth.
          if (dCosmos) {
            // the galaxy disk is the payoff — it reveals only at the wake.
            // ken-burns drift: the footage is a locked-off shot, so the FRAME
            // moves instead — slow zoom breathing + a wandering pan that
            // deepens with the dream
            dCosmos.style.opacity = dream * 0.92;
            const kbScale = 1.07 + dream * 0.05 + Math.sin(now / 9000) * (0.035 + dream * 0.04);
            const kbX = Math.sin(now / 10500) * 2.1 * dream;
            const kbY = Math.sin(now / 13000) * (1.2 + dream * 1.3);
            dCosmos.style.transform = "scale(" + kbScale + ") translate(" + kbX + "%, " + kbY + "%)";
          }
          if (dCalm) {
            // calm starfield owns the sleeping phase, hands off as cards arrive
            dCalm.style.opacity = eio(sg(u, 0.06, 0.26)) * 0.5 * (1 - eio(sg(u, 0.30, 0.46)));
            dCalm.style.transform = "scale(" + (1.06 + Math.sin(now / 11000) * 0.03) + ")";
          }
          // pure-CSS nebula blobs back the wonder × craft beat, then SOFTEN
          // (not vanish) into the wake — their drift keeps the cloud fields
          // around the disk alive, since the footage's clouds barely move
          if (dBlobs) dBlobs.style.opacity = eio(sg(u, 0.28, 0.40)) * (1 - eio(sg(u, 0.56, 0.68)) * 0.62);
          if (dCveil) dCveil.style.opacity = dream;
          // aurora curtains — behind everything, wake phase only
          if (dream > 0.01) {
            ctxB.save();
            ctxB.globalCompositeOperation = "lighter";
            const SL = 14; // vertical slices per ribbon
            for (const rb of ribbons) {
              const bw = W * rb.w, bx = W * rb.x - bw / 2, bh = H * 0.86;
              const breathe = 0.75 + 0.25 * Math.sin(now / 4300 + rb.ph);
              ctxB.globalAlpha = 0.32 * dream * breathe;
              const sh = bh / SL, sprH = rb.spr.height / SL;
              for (let sl = 0; sl < SL; sl++) {
                const warp = Math.sin(now / rb.spd + rb.ph + sl * 0.42) * rb.amp * (0.35 + sl / SL);
                // exact slice height — a +1 overlap doubles up in 'lighter'
                // mode and paints visible seam lines
                ctxB.drawImage(rb.spr, 0, sl * sprH, rb.spr.width, sprH, bx + warp, sl * sh, bw, sh);
              }
            }
            ctxB.restore();
          }
          // center beam: a live light shaft over the footage's frozen one —
          // shimmers on two beat frequencies, sways, tapers toward the cube
          if (dream > 0.01) {
            const sway = Math.sin(now / 5200) * 9 * dream;
            const bw = Math.min(W, H) * (0.11 + 0.022 * Math.sin(now / 3100));
            const pulse = 0.55 + 0.3 * Math.sin(now / 2400) + 0.15 * Math.sin(now / 900);
            ctxB.save();
            ctxB.globalCompositeOperation = "lighter";
            const bg2 = ctxB.createLinearGradient(cx + sway, 0, cx + sway, cy);
            bg2.addColorStop(0, "rgba(241,234,217," + (0.17 * pulse * dream).toFixed(3) + ")");
            bg2.addColorStop(0.7, "rgba(158,217,191," + (0.10 * pulse * dream).toFixed(3) + ")");
            bg2.addColorStop(1, "rgba(241,234,217,0)");
            ctxB.beginPath();
            ctxB.moveTo(cx + sway - bw * 0.55, -10);
            ctxB.lineTo(cx + sway + bw * 0.55, -10);
            ctxB.lineTo(cx + bw * 0.28, cy);
            ctxB.lineTo(cx - bw * 0.28, cy);
            ctxB.closePath();
            ctxB.fillStyle = bg2;
            ctxB.fill();
            // bright inner core, tighter
            const core = ctxB.createLinearGradient(cx + sway * 0.7, 0, cx + sway * 0.7, cy);
            core.addColorStop(0, "rgba(241,234,217," + (0.12 * pulse * dream).toFixed(3) + ")");
            core.addColorStop(1, "rgba(241,234,217,0)");
            ctxB.beginPath();
            ctxB.moveTo(cx + sway * 0.7 - bw * 0.18, -10);
            ctxB.lineTo(cx + sway * 0.7 + bw * 0.18, -10);
            ctxB.lineTo(cx + bw * 0.10, cy);
            ctxB.lineTo(cx - bw * 0.10, cy);
            ctxB.closePath();
            ctxB.fillStyle = core;
            ctxB.fill();
            ctxB.restore();
          }
          if (dAlpha) { dAlpha.style.opacity = dream; dAlpha.style.transform = "translate(-50%,-50%) scale(" + (0.9 + dream * 0.16) + ")"; }
          // ring stays around the tofu through the punchline and gets livelier
          const lively = eio(sg(u, 0.56, 0.80));
          const aura = 0.26 + 0.15 * Math.sin(now / 2600) + 0.3 * push + 0.16 * lively;
          const ar = Math.min(W, H) * (0.5 + push * 0.6);
          const g = ctxB.createRadialGradient(cx, cy, 0, cx, cy, ar);
          g.addColorStop(0, "rgba(158,217,191," + (0.15 * aura + 0.06) + ")");
          g.addColorStop(0.5, "rgba(243,181,156," + (0.05 * aura) + ")");
          g.addColorStop(1, "rgba(15,24,20,0)");
          ctxB.fillStyle = g; ctxB.fillRect(0, 0, W, H);
          const glow = fd(u, -1, -0.5, 0.99, 1.0);                          // on from the approach, stays
          const baseR = Math.min(W, H) * (0.25 + push * 0.28 + lively * 0.08); // starts closer to the tofu
          const rot = now / 4400;
          ctxB.globalCompositeOperation = "lighter"; ctxF.globalCompositeOperation = "lighter";
          for (let i = 0; i < ring.length; i++) {
            const p = ring[i], ang = p.a + rot * p.sp, s = Math.sin(ang);
            const x = cx + Math.cos(ang) * baseR * (p.r / 0.32), y = cy + s * baseR * (p.r / 0.32) * TILT;
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(p.tw + now / 500 * p.sp * (1 + lively * 1.3)));
            const sz = (1 + tw * 1.8) * (1 + push * 0.5 + lively * 0.7);
            const C = s > 0 ? ctxF : ctxB, depth = s > 0 ? 1.15 : 0.9;
            C.globalAlpha = tw * glow * depth * (1 + lively * 0.4); C.fillStyle = p.c;
            C.beginPath(); C.arc(x, y, sz * depth, 0, 6.28); C.fill();
          }
          for (let k = 0; k < motes.length; k++) {
            const m = motes[k], z = (m.z + now / 9000 * (1 + lively * 0.9)) % 1;
            const rr = (0.1 + z * 0.9) * Math.min(W, H) * 0.55 * (1 + push * 0.4);
            const x = cx + Math.cos(m.a) * rr, y = cy + Math.sin(m.a) * rr * 0.8;
            ctxB.globalAlpha = (1 - z) * (0.45 + lively * 0.3) * glow; ctxB.fillStyle = m.c;
            ctxB.beginPath(); ctxB.arc(x, y, 0.6 + z * 2, 0, 6.28); ctxB.fill();
          }
          // dream-bridge: while the cards are up, motes stream from behind the
          // tofu out into each card — the tofu is dreaming the two ideas
          const bAmt = fd(u, 0.36, 0.44, 0.52, 0.575);
          if (bAmt > 0) {
            for (let k = 0; k < bmotes.length; k++) {
              const m = bmotes[k];
              const t = ((now / m.dur) + m.ph) % 1;
              // bridge targets follow the card layout: flanking on desktop,
              // stacked above/below on mobile
              const tx = MOB ? W * 0.5 : W * (m.side < 0 ? 0.31 : 0.69);
              const ty = MOB ? H * (m.side < 0 ? 0.32 : 0.68) : H * 0.44;
              const x = cx + (tx - cx) * t;
              const y = cy + (ty - cy) * t + Math.sin(t * 9.42 + m.ph * 6.28) * 9 * (1 - t);
              ctxB.globalAlpha = Math.sin(t * Math.PI) * 0.65 * bAmt;
              ctxB.fillStyle = m.c;
              ctxB.beginPath(); ctxB.arc(x, y, 1.1 + (1 - t) * 1.7, 0, 6.28); ctxB.fill();
            }
          }
          ctxB.globalAlpha = 1; ctxF.globalAlpha = 1;
          ctxB.globalCompositeOperation = "source-over"; ctxF.globalCompositeOperation = "source-over";
          // shooting star — rare, singular, arcing down the ring's tilt
          if (dream > 0.3) {
            if (!shoot && now > nextShoot) {
              const fromRight = Math.random() < 0.5;
              shoot = { x0: W * (fromRight ? 0.72 : 0.28), y0: H * (0.16 + Math.random() * 0.1), dir: fromRight ? -1 : 1, t0: now, dur: 620 };
            }
            if (shoot) {
              const t = (now - shoot.t0) / shoot.dur;
              if (t >= 1) { shoot = null; nextShoot = now + 6000 + Math.random() * 5000; }
              else {
                const dist = W * 0.34 * t;
                const x = shoot.x0 + shoot.dir * dist;
                const y = shoot.y0 + dist * TILT * 0.9;
                const a = Math.sin(t * Math.PI);
                const tail = 90 * (0.4 + a);
                const tx2 = x - shoot.dir * tail, ty2 = y - tail * TILT * 0.9;
                const grad = ctxF.createLinearGradient(x, y, tx2, ty2);
                grad.addColorStop(0, "rgba(241,234,217," + (0.9 * a * dream).toFixed(3) + ")");
                grad.addColorStop(1, "rgba(241,234,217,0)");
                ctxF.globalCompositeOperation = "lighter";
                ctxF.strokeStyle = grad; ctxF.lineWidth = 1.6; ctxF.lineCap = "round";
                ctxF.beginPath(); ctxF.moveTo(x, y); ctxF.lineTo(tx2, ty2); ctxF.stroke();
                ctxF.globalAlpha = a * dream;
                ctxF.fillStyle = "#f1ead9";
                ctxF.beginPath(); ctxF.arc(x, y, 1.8 + a * 1.4, 0, 6.28); ctxF.fill();
                ctxF.globalAlpha = 1;
                ctxF.globalCompositeOperation = "source-over";
              }
            }
          }
          if (dStill) {
            // visible from the approach (CSS opacity 1) — no dead beat at pin start
            const sOp = fd(u, -1, -0.5, 0.58, 0.68);
            dStill.style.opacity = sOp;
            // pokeable only while actually visible (it fades out for the wake)
            dStill.style.pointerEvents = sOp > 0.35 ? "auto" : "none";
            dStill.style.transform = "translate(-50%,-50%) scale(" + (0.86 + eio(sg(u, 0, 0.30)) * 0.14) + ") rotate(" + (Math.sin(now / 3200) * 1.6) + "deg)";
          }
          if (dLead) dLead.style.opacity = fd(u, -1, -0.5, 0.24, 0.30);
          const cardFn = (el, side, fromX, fromY, fromR) => {
            if (!el) return;
            // wonder settles first, craft answers a beat later; both hold a
            // real plateau (0.44–0.52), then leave together before the wake
            const a0 = side === "w" ? 0.30 : 0.36, a1 = side === "w" ? 0.38 : 0.44;
            el.style.opacity = fd(u, a0, a1, 0.52, 0.575);
            const sIn = 1 - eio(sg(u, a0, a1)), out = eio(sg(u, 0.52, 0.575));
            // arc in along the ring's tilt: diagonal drift + settling rotation
            el.style.transform =
              "translate(" + (fromX * sIn - out * fromX * 1.4) + "px, calc(-50% + " + (fromY * sIn + out * -10) + "px)) " +
              "rotate(" + (fromR * sIn).toFixed(3) + "deg)";
          };
          cardFn(dCardW, "w", -44, 18, -2.5); cardFn(dCardC, "c", 44, -18, 2.5);
          // the × appears only once both cards are present — the row reads
          // "wonder × craft" straight across
          if (dGlyph) dGlyph.style.opacity = fd(u, 0.44, 0.48, 0.52, 0.575);
          if (dPunch) {
            dPunch.style.opacity = fd(u, 0.64, 0.76, 0.99, 1.0);
            dPunch.style.filter = "blur(" + ((1 - eio(sg(u, 0.64, 0.76))) * 10) + "px)";
            dPunch.style.transform = "translateX(-50%) translateY(" + ((1 - eio(sg(u, 0.64, 0.76))) * 18) + "px)";
          }
          if (dBloom) {
            dBloom.style.opacity = fd(u, 0.62, 0.76, 0.99, 1.0) * 0.9;
            dBloom.style.transform = "translate(-50%,20%) scale(" + (0.7 + eio(sg(u, 0.62, 0.8)) * 0.5) + ")";
          }
        };

        gsap.ticker.add(render);
        ScrollTrigger.create({
          trigger: dScene, start: "top top", end: "+=320%",
          pin: true, scrub: 1, anticipatePin: 1, invalidateOnRefresh: true,
          onToggle: (self) => {
            active = self.isActive;
            if (active) {
              // retry playback on pin — some browsers block the initial
              // play() (strict autoplay settings) and only the poster shows
              [dCosmos, dCalm, dAlpha].forEach((v) => { const p = v && v.play && v.play(); if (p && p.catch) p.catch(() => {}); });
              render();
            }
          },
          onUpdate: (self) => { U = self.progress; },
        });

        // poke the dreaming tofu — same squash physics as the hero cube
        // (squash anchored near the base, elastic settle, soft glow surge).
        // squash rides the img, glow rides the float wrapper — the outer div
        // belongs to the scroll choreography and stays untouched.
        {
          const dFloat = q(".it-dream-still-float", dScene);
          const dImg = dStill && q("img", dStill);
          if (dStill && dFloat && dImg) {
            // idle wander: drift to a new random offset every few seconds,
            // sine in-out both ways — reads as zero-g, never as a loop.
            // lives on the float wrapper; the outer div stays owned by the
            // scroll choreography. mm auto-kills this on revert.
            const wander = () => {
              gsap.to(dFloat, {
                x: gsap.utils.random(-18, 18),
                y: gsap.utils.random(-14, 20),
                duration: gsap.utils.random(3.6, 5.6),
                ease: "sine.inOut",
                onComplete: wander,
              });
            };
            wander();

            let dPokeTl;
            dStill.addEventListener("pointerdown", () => {
              dPokeTl?.kill();
              dPokeTl = gsap
                .timeline()
                .to(dImg, {
                  scaleX: 1.16, scaleY: 0.8, transformOrigin: "50% 76%",
                  duration: 0.13, ease: "power2.in",
                })
                .to(dImg, {
                  scaleX: 1, scaleY: 1,
                  duration: 1.5, ease: "elastic.out(1.2, 0.22)",
                })
                .fromTo(dFloat, { filter: "brightness(1)" },
                  { filter: "brightness(1.28)", duration: 0.2, ease: "power2.out" }, 0)
                .to(dFloat, { filter: "brightness(1)", duration: 1, ease: "sine.out" }, 0.24);
            });
          }
        }
      }
    }
  }

  /* ---------------- magnetic CTA button ---------------- */

  if (matchMedia("(pointer: fine)").matches) {
    qa(".it-magnetic").forEach((btn) => {
      const xTo = gsap.quickTo(btn, "x", { duration: 0.5, ease: "power3" });
      const yTo = gsap.quickTo(btn, "y", { duration: 0.5, ease: "power3" });
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.3);
        yTo((e.clientY - r.top - r.height / 2) * 0.3);
      });
      btn.addEventListener("pointerleave", () => {
        xTo(0);
        yTo(0);
      });
    });
  }

  /* ---------------- marquee: hover eases to a crawl ---------------- */

  {
    const track = q(".it-marquee-track");
    const wrap = q(".it-marquee");
    if (track && wrap && !GECKO) {   // Firefox phones keep the CSS loop: it runs on the compositor, a JS tween repaints
      track.style.animation = "none"; // JS takes over from the CSS loop
      const tween = gsap.to(track, { xPercent: -50, duration: 52, ease: "none", repeat: -1 }); // keep px/s pace with the 6-item track
      wrap.addEventListener("mouseenter", () =>
        gsap.to(tween, { timeScale: 0.18, duration: 0.6, ease: "power2.out" })
      );
      wrap.addEventListener("mouseleave", () =>
        gsap.to(tween, { timeScale: 1, duration: 0.9, ease: "power2.inOut" })
      );
    }
    // separator tofus (Oct 25 2026): the squish used to be an infinite 3.4s CSS animation on all twelve dots,
    // still for 82% of its cycle yet recalculating twelve elements every frame. Now each dot plays a finite
    // 0.612s animation (the same 82 -> 100% keyframes, sections.css) on the old schedule: first at 2.788s plus
    // its old nth-child delay (0.7s steps per list), then every 3.4s. About two dots animate at any moment.
    if (wrap) {
      const dots = qa(".it-tofu-dot", wrap);
      const FIRST = 2788, PERIOD = 3400, STAGGER = 700; // ms: 82% of the loop, the loop, the per-dot delay step
      dots.forEach((dot, i) => {
        dot.addEventListener("animationend", () => dot.classList.remove("is-squish"));
        const fire = () => { if (!document.hidden && isOn("marquee")) dot.classList.add("is-squish"); };
        setTimeout(() => { fire(); setInterval(fire, PERIOD); }, FIRST + (i % 6) * STAGGER);
      });
    }
  }

  /* ---------------- housekeeping ---------------- */

  ScrollTrigger.sort();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  runPreloader().then(heroIntro);
}
