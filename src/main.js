/* Imagine TOFU v3 — boot.
   Lenis + ScrollTrigger wiring, nav, menu, clock; hands
   everything motion-related to motion.js (reduced-motion gated). */

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sections.css";
import "./styles/dream-glass.css";
import "./styles/lite.css";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { initMotion } from "./motion.js";
import { initDreamGlass } from "./dream-glass.js";
import { initStudioMascot, initBuddy, initBuddyScrollTop } from "./mascot.js";
import { initCursor } from "./cursor.js";
import { initTileArt } from "./tile-art.js";
import { initWorkCards } from "./work-cards.js";
import { initGooeyCards } from "./gooey-cards.js";
import { initPageTransition } from "./page-transition.js";
import { TOUCH, initPerf, initFrameWatch } from "./perf.js";

gsap.registerPlugin(ScrollTrigger);
// phones: the URL bar sliding away fires a resize every few frames; without this ScrollTrigger
// re-measures every trigger and pin each time, which is the classic mid-scroll hitch on Android
ScrollTrigger.config({ ignoreMobileResize: true });
window.gsap = gsap; // console/debug handle (harmless in prod)

const doc = document.documentElement;
const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
let reduced = reducedQuery.matches;

// keep the .reduced class live if the OS setting flips mid-session
reducedQuery.addEventListener("change", (e) => {
  doc.classList.toggle("reduced", e.matches);
});

/* ---------- smooth scroll ---------- */

let lenis = null;
if (!reduced && TOUCH) {
  // touch screens keep the browser's own compositor-driven scroll (Lenis would only add main-thread
  // work there); this stand-in keeps the stop/start/scrollTo calls the rest of the page makes
  history.scrollRestoration = "manual";
  scrollTo(0, 0);
  lenis = {
    stop() { doc.style.overflow = "hidden"; },
    start() { doc.style.overflow = ""; },
    scrollTo(target, { offset = 0 } = {}) {
      const y = typeof target === "number" ? target : target.getBoundingClientRect().top + scrollY + offset;
      scrollTo({ top: y, behavior: "smooth" });
    },
  };
} else if (!reduced) {
  // the preloader owns the first paint — always start at the top so
  // browser scroll-restoration can't desync Lenis while it's stopped
  history.scrollRestoration = "manual";
  scrollTo(0, 0);
  // continuous lerp smoothing (follows trackpad and wheel input fluidly) instead of a fixed-duration ease
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1 });
  lenis.on("scroll", ScrollTrigger.update);
  // prioritized (third arg): Lenis moves the window BEFORE gsap renders this frame's tweens. The
  // ticker's default order ran the tween writes first, so window.scrollTo found dirty styles and
  // forced a synchronous style + layout of the whole page every scrolled frame, and the browser
  // then did it all again at the end of the frame (measured: 2 style/layout passes per frame).
  gsap.ticker.add((t) => lenis.raf(t * 1000), false, true);
  gsap.ticker.lagSmoothing(0);
  window.lenis = lenis; // debug/verification handle
}

/* ---------- anchor links ---------- */

const menu = document.getElementById("it-menu");
const menuBtn = document.querySelector(".it-menu-btn");
const menuClose = document.querySelector(".it-menu-close");

let menuTimer = 0;

function finishClose() {
  clearTimeout(menuTimer);
  if (!menu || menu.classList.contains("is-open")) return;
  menu.hidden = true;
}
function closeMenu({ restoreFocus = true } = {}) {
  if (!menu || menu.hidden || !menu.classList.contains("is-open")) return;
  menu.classList.remove("is-open");
  menuBtn?.setAttribute("aria-expanded", "false");
  doc.style.overflow = "";
  lenis?.start();
  if (restoreFocus) menuBtn?.focus({ preventScroll: true });
  // hide once the curtain has lifted (fallback if transitionend is missed)
  menuTimer = setTimeout(finishClose, reduced ? 0 : 560);
}
function openMenu() {
  if (!menu) return;
  clearTimeout(menuTimer);
  menu.hidden = false;
  menu.getBoundingClientRect(); // commit the closed state so the transition runs
  menu.classList.add("is-open");
  menuBtn?.setAttribute("aria-expanded", "true");
  doc.style.overflow = "hidden";
  lenis?.stop();
  menuClose?.focus({ preventScroll: true });
}
menu?.addEventListener("transitionend", (e) => {
  if (e.target === menu && e.propertyName === "clip-path") finishClose();
});
menuBtn?.addEventListener("click", () =>
  menu?.classList.contains("is-open") ? closeMenu() : openMenu()
);
menuClose?.addEventListener("click", () => closeMenu());
addEventListener("keydown", (e) => {
  if (!menu?.classList.contains("is-open")) return;
  if (e.key === "Escape") return closeMenu();
  if (e.key !== "Tab") return;
  // keep focus inside the open menu
  const items = menu.querySelectorAll("button, a[href]");
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
// leaving the mobile breakpoint with the menu open: reset cleanly
matchMedia("(min-width: 861px)").addEventListener("change", (e) => {
  if (e.matches) closeMenu({ restoreFocus: false });
});

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (!id || id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeMenu({ restoreFocus: false });
    if (lenis) lenis.scrollTo(target, { offset: -64 });
    else target.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  });
});

/* ---------- nav scrolled state ---------- */

const nav = document.getElementById("it-nav");
const onScroll = () => nav?.classList.toggle("is-scrolled", scrollY > 24);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---------- footer clock (San Leandro / Pacific) ---------- */

const timeEl = document.querySelector(".it-local-time");
if (timeEl) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  const tick = () => (timeEl.textContent = fmt.format(new Date()));
  tick();
  setInterval(tick, 30_000);
}

/* ---------- mascots, cursor, motion ---------- */

initStudioMascot({ reduced });
initBuddy({ reduced, gsap });
initBuddyScrollTop({ lenis, reduced });
initCursor({ reduced, gsap });
initWorkCards({ reduced }); // work cards: poster + hover/in-view scroll loop
initGooeyCards({ gsap, reduced }); // work cards: gooey blob reveals the loop (desktop, WebGL)
initPageTransition({ gsap, reduced }); // pixel cells between pages
initTileArt({ reduced }); // service windows: ascii/pixel canvas (static frame when reduced)

if (!reduced) {
  initPerf({ gsap });
  initFrameWatch();
  initMotion({ gsap, ScrollTrigger, lenis });
  initDreamGlass({ gsap, ScrollTrigger });
} else {
  // static page: make sure nothing is left waiting on a reveal
  ScrollTrigger.refresh();
}
