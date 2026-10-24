/* Imagine TOFU v3 — mascots.
   1) Studio render: lazy-loaded when the section approaches.
   2) Corner buddy: pixel-art face with frame swaps. Idle pool
      (blink 70% / glance 20% / squish 10%), sleeps after 45s of quiet,
      eyes follow the cursor. Interaction faces: hover = ^_^,
      click = kissy + scroll to top. Corner = bottom-right; dims
      (z-swap) with a 150ms delay over the footer. These parameter
      choices are documented in CLAUDE.md.
   Note: the hero mascot is now the floating glass cube (a still WebP),
   choreographed entirely in motion.js — no PNG↔GIF swapping needed. */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// reduced-motion fallback for the studio mascot — same calm render the
// motion path uses (the old dark screen-face cube read off-family here)
const STATIC = "/brand/tofu-calm.webp";

export function initStudioMascot({ reduced }) {
  const img = document.querySelector(".it-studio-mascot .it-mascot-media");
  if (!img) return;
  const src = reduced ? STATIC : img.dataset.src;
  const io = new IntersectionObserver(
    (entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) {
        img.src = src;
        obs.disconnect();
      }
    },
    { rootMargin: "600px" }
  );
  io.observe(img);
}

/* ---------------- corner buddy ---------------- */

/* Back-to-top lives OUTSIDE the motion gate so the buddy is a working
   button even with reduced motion (where initBuddy returns early). */
export function initBuddyScrollTop({ lenis, reduced }) {
  document.querySelector(".it-buddy")?.addEventListener("click", () => {
    if (lenis) lenis.scrollTo(0);
    else scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  });
}

export function initBuddy({ reduced }) {
  const buddy = document.querySelector(".it-buddy");
  if (!buddy || reduced) return; // reduced: CSS shows it, statically

  const eyes = buddy.querySelector(".it-buddy-eyes");
  const face = buddy.querySelector(".it-buddy-face");
  const body = buddy.querySelector(".it-buddy-body");
  const zzz = buddy.querySelector(".it-buddy-zzz");
  const bubble = buddy.querySelector(".it-buddy-bubble");

  let sleeping = false;
  let lastActivity = performance.now();
  let visible = false;

  /* --- pixel face frames (hard visibility swaps, no tweened squash) --- */

  const FRAMES = {
    default: { eyes: ".it-eyes-open", mouth: ".it-mouth-cat" },
    blink: { eyes: ".it-eyes-blink", mouth: ".it-mouth-cat" },
    happy: { eyes: ".it-eyes-happy", mouth: ".it-mouth-cat" },
    kiss: { eyes: ".it-eyes-happy", mouth: ".it-mouth-kiss" },
    sleep: { eyes: ".it-eyes-sleep", mouth: ".it-mouth-cat" },
  };
  const eyeFrames = [...buddy.querySelectorAll(".it-buddy-eyes > g")];
  const mouthFrames = [...buddy.querySelectorAll(".it-buddy-mouth > g")];

  let hovering = false;
  let kissUntil = 0; // transient click face
  let blinkTimer = 0;

  const setFrame = (name) => {
    const f = FRAMES[name];
    eyeFrames.forEach((g) => (g.style.visibility = g.matches(f.eyes) ? "visible" : "hidden"));
    mouthFrames.forEach((g) => (g.style.visibility = g.matches(f.mouth) ? "visible" : "hidden"));
  };

  /* priority: kiss (click) > sleep > hover-happy > default */
  const resolveFace = () => {
    clearTimeout(blinkTimer);
    if (performance.now() < kissUntil) setFrame("kiss");
    else if (sleeping) setFrame("sleep");
    else if (hovering) setFrame("happy");
    else setFrame("default");
  };
  resolveFace();

  gsap.set(buddy, { y: 16 });

  /* appear once the hero is mostly gone */
  ScrollTrigger.create({
    start: () => innerHeight * 0.7,
    onEnter: () => {
      visible = true;
      gsap.to(buddy, { autoAlpha: 1, y: 0, duration: 0.7, ease: "power3.out" });
    },
    onLeaveBack: () => {
      visible = false;
      gsap.to(buddy, { autoAlpha: 0, y: 16, duration: 0.5, ease: "power2.in" });
    },
  });

  /* dim behind the footer (z-swap, 150ms delay); case pages have no footer */
  if (document.querySelector(".it-footer")) ScrollTrigger.create({
    trigger: ".it-footer",
    start: "top 88%",
    onEnter: () => gsap.to(buddy, { autoAlpha: 0.3, delay: 0.15, duration: 0.4 }),
    onLeaveBack: () => visible && gsap.to(buddy, { autoAlpha: 1, duration: 0.4 }),
  });

  /* --- idle pool: blink 70 / glance 20 / squish 10 --- */

  const blink = (n = 1) => {
    if (sleeping || hovering || performance.now() < kissUntil) return;
    clearTimeout(blinkTimer);
    setFrame("blink");
    blinkTimer = setTimeout(() => {
      resolveFace();
      if (n > 1) blinkTimer = setTimeout(() => blink(n - 1), 110);
    }, 120);
  };

  const glance = () => {
    const dir = Math.random() > 0.5 ? 3 : -3;
    gsap
      .timeline()
      .to(face, { x: dir, duration: 0.3, ease: "power2.out" })
      .to(face, { x: 0, duration: 0.4, ease: "power2.inOut", delay: 0.7 });
  };

  const squish = () =>
    gsap
      .timeline()
      .to(body, { scaleX: 1.08, scaleY: 0.94, duration: 0.22, ease: "power2.inOut" })
      .to(body, { scaleX: 1, scaleY: 1, duration: 0.34, ease: "power2.out" });

  const idleTick = () => {
    if (!sleeping && visible && !document.hidden) {
      const roll = Math.random();
      if (roll < 0.7) blink();
      else if (roll < 0.9) glance();
      else squish();
    }
    setTimeout(idleTick, 3600 + Math.random() * 2800);
  };
  setTimeout(idleTick, 2500);

  /* --- sleep after 45s of no input --- */

  const SLEEP_AFTER = 45_000;

  const fallAsleep = () => {
    sleeping = true;
    resolveFace();
    gsap.to(zzz, { opacity: 1, duration: 0.5 });
    gsap.to(zzz, { y: -3, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 });
  };
  const wake = () => {
    if (!sleeping) return;
    sleeping = false;
    gsap.killTweensOf(zzz);
    gsap.to(zzz, { opacity: 0, y: 0, duration: 0.3 });
    resolveFace();
    blink(2);
  };

  const activity = () => {
    lastActivity = performance.now();
    wake();
  };
  addEventListener("scroll", activity, { passive: true });
  addEventListener("pointermove", activity, { passive: true });
  addEventListener("keydown", activity);

  setInterval(() => {
    if (!sleeping && performance.now() - lastActivity > SLEEP_AFTER) fallAsleep();
  }, 3000);

  /* --- hover: ^_^ (real hover devices only, no sticky touch state) --- */

  if (matchMedia("(hover: hover)").matches) {
    buddy.addEventListener("pointerenter", () => {
      hovering = true;
      if (!sleeping) resolveFace();
    });
    buddy.addEventListener("pointerleave", () => {
      hovering = false;
      resolveFace();
    });
  }

  /* --- eyes follow the cursor (fine pointers, whole-pixel steps) --- */

  if (matchMedia("(pointer: fine)").matches) {
    const ex = gsap.quickTo(eyes, "x", { duration: 0.5, ease: "power2" });
    const ey = gsap.quickTo(eyes, "y", { duration: 0.5, ease: "power2" });
    addEventListener(
      "pointermove",
      (e) => {
        if (sleeping) return;
        const r = buddy.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        ex(gsap.utils.snap(1, gsap.utils.clamp(-2.4, 2.4, dx / 90)));
        ey(gsap.utils.snap(1, gsap.utils.clamp(-1.8, 1.8, dy / 110)));
      },
      { passive: true }
    );
  }

  /* --- click: kissy face + bubble (scroll-to-top wired separately) --- */

  buddy.addEventListener("click", () => {
    wake();
    kissUntil = performance.now() + 1100;
    resolveFace();
    setTimeout(resolveFace, 1150);
    gsap
      .timeline()
      .fromTo(
        bubble,
        { opacity: 0, y: 5, scale: 0.7, transformOrigin: "80% 100%" },
        { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "power3.out" }
      )
      .to(bubble, { opacity: 0, y: -4, duration: 0.4, ease: "power2.in", delay: 1.5 });
  });
}
