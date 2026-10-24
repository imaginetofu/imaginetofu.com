/* Imagine TOFU — case-study page boot (v3).
   Lenis smooth scroll + GSAP ScrollTrigger:
     1. story pillars: the hero capture splits into three tiles that open
        and flip to scope / problem / solution (AnimMaster scroll-40, no fan)
     2. works (case-works.js): big frames on an offset grid, each revealed by
        a pixel sweep (AnimMaster scroll-57 + scroll-11); the first frame is
        the full homepage auto-scrolling. Replaces the scroll-scrub and the
        drift gallery (both dropped 2026-10-22: choppy, too small). No hover.
     3. pixel page transition (AnimMaster pegetr-4, shared with the home page)
   Reduced motion: none of the above; tiles show their text, the full page
   frame becomes a normal scroll box.
   Coarse pointers / small screens: no pins; frames stack in one column. */

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/case.css";
import "./styles/lite.css";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { TOUCH } from "./perf.js";
import { initPageTransition } from "./page-transition.js";
import { initCaseWorks } from "./case-works.js";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true }); // URL-bar collapses must not re-measure every trigger

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const motion = !reduced;
if (!fine) document.documentElement.classList.add("is-coarse");

initPageTransition({ gsap, reduced });

/* ---------- smooth scroll ---------- */

let lenis = null;
if (motion && !TOUCH) {   // touch keeps the browser's own scroll: smoother, and no main-thread smoothing loop
  lenis = new Lenis({ duration: 1.15 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

/* ---------- reveals: CSS transitions, IO-triggered ---------- */

{
  const els = document.querySelectorAll("[data-cs-reveal]");
  if ("IntersectionObserver" in window && motion) {
    let queued = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          setTimeout(() => el.classList.add("is-in"), (queued++ % 4) * 90);
          setTimeout(() => { queued = Math.max(0, queued - 1); }, 400);
          io.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
  } else {
    els.forEach((el) => el.classList.add("is-in"));
  }
}

/* ---------- lazy video: HEAD-probe .webm then .mp4, play in view ----------
   Any [data-src="/work/<slug>/<name>"] host holding a <video>. Missing file →
   .is-pending on the host. Returns a promise resolving to the src or null. */

const probe = async (base) => {
  for (const src of [base + ".webm", base + ".mp4"]) {
    try {
      const res = await fetch(src, { method: "HEAD" });
      if (res.ok && (res.headers.get("content-type") || "").startsWith("video/")) return src;
    } catch { /* next */ }
  }
  return null;
};

const playIO = motion
  ? new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target.querySelector("video");
          if (!v) continue;
          if (e.isIntersecting) v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.2 }
    )
  : null;

async function attachLoop(host) {
  const video = host.querySelector("video");
  const src = host.dataset.src && (await probe(host.dataset.src));
  if (!video || !src) { host.classList.add("is-pending"); return null; }
  video.src = src;
  if (playIO) playIO.observe(host);
  else video.controls = true;
  return src;
}

document.querySelectorAll("[data-src]").forEach(attachLoop);

/* ---------- 1. story pillars (scroll-40) ---------- */

{
  const section = document.querySelector(".it-cs-pillars");
  const pin = section?.querySelector(".it-cs-pillars-pin");
  const row = section?.querySelector(".it-cs-pillar-row");
  const tiles = section ? [...section.querySelectorAll(".it-cs-pillar")] : [];
  const head = section?.querySelector(".it-cs-pillars-head");
  if (section && row && tiles.length === 3) {
    // static tiles are plain text cards, so the row must not read as one image to screen readers
    // (role="img" would hide the three cards' text); the live desktop flip puts it back
    const imgRole = [row.getAttribute("role"), row.getAttribute("aria-label")];
    const asText = () => { row.removeAttribute("role"); row.removeAttribute("aria-label"); };
    asText();
    const mm = gsap.matchMedia();
    // the pinned flip needs room and a mouse-free scroll is fine, but not a phone
    mm.add("(min-width: 900px) and (prefers-reduced-motion: no-preference)", () => {
      section.classList.add("is-live");
      // the backs anchor their text to the bottom, so a 2-line title next to a 3-line one (or a
      // shorter body) leaves the headings at different heights. Give each row's titles and bodies
      // the tallest one's height so every heading starts on the same line.
      // tiles with their own visual (story tiles v2) size themselves on purpose, so only plain rows even up
      const plain = tiles.every((t) => !t.querySelector(".it-cs-pillar-art") && !t.classList.contains("is-poster"));
      const parts = (sel) => (plain ? tiles : []).map((t) => t.querySelector(sel)).filter(Boolean);
      const evenUp = () => {
        for (const group of [parts(".it-cs-pillar-title"), parts(".it-cs-pillar-body")]) {
          group.forEach((el) => { el.style.minHeight = ""; });
          const h = Math.max(...group.map((el) => el.getBoundingClientRect().height));
          group.forEach((el) => { el.style.minHeight = h + "px"; });
        }
      };
      evenUp();
      document.fonts?.ready.then(evenUp);
      let evenT;
      const ro = "ResizeObserver" in window ? new ResizeObserver(() => { clearTimeout(evenT); evenT = setTimeout(evenUp, 80); }) : null;
      ro?.observe(row);
      if (imgRole[0]) row.setAttribute("role", imgRole[0]);
      if (imgRole[1]) row.setAttribute("aria-label", imgRole[1]);
      const radius = () => parseFloat(getComputedStyle(row).getPropertyValue("--pr")) || 22;
      gsap.set(head, { y: 40, autoAlpha: 0 });
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: pin, start: "top top", end: "+=" + Math.round(innerHeight * 3),
          pin: true, anticipatePin: 1, scrub: 0.6, invalidateOnRefresh: true,
        },
      });
      tl.to(head, { y: 0, autoAlpha: 1, duration: 0.15 }, 0.06)
        .fromTo(row, { "--pw": 1 }, { "--pw": 0.84, duration: 0.25 }, 0)
        .fromTo(row, { "--pg": 0 }, { "--pg": 1, duration: 0.12, ease: "power2.out" }, 0.3)
        .fromTo(tiles, { "--pround": 0 }, { "--pround": 1, duration: 0.12, ease: "power2.out" }, 0.3)
        .to(tiles, { rotationY: 180, duration: 0.22, ease: "power2.inOut", stagger: 0.07 }, 0.56)
        .to({}, { duration: 0.08 }); // a beat of rest at the end
      return () => { ro?.disconnect(); [...parts(".it-cs-pillar-title"), ...parts(".it-cs-pillar-body")].forEach((el) => { el.style.minHeight = ""; }); section.classList.remove("is-live"); asText(); gsap.set([head, ...tiles, row], { clearProps: "all" }); };
    });
  }
}

/* ---------- 2. works: big frames, pixel reveal, one auto-scrolling page ---------- */

initCaseWorks({ gsap, ScrollTrigger, reduced });
