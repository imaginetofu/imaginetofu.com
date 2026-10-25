/* Imagine TOFU — /book/ page boot.
   Three meeting tiles act as a radio group. Picking one loads TidyCal's
   embed script once (all three embeds render in that pass), shows the
   picked calendar and scrolls to it. #project-chat / #deep-press /
   #care-check-in in the URL preselect a seat.
   Lenis + reveals + pixel page transition match the case pages.
   Reduced motion: no Lenis, no smooth scroll, no transitions. */

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/case.css";
import "./styles/book.css";
import "./styles/lite.css";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { TOUCH } from "./perf.js";
import { initPageTransition } from "./page-transition.js";

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true }); // URL-bar collapses must not re-measure every trigger

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const motion = !reduced;

initPageTransition({ gsap, reduced });

/* ---------- smooth scroll ---------- */

let lenis = null;
if (motion && !TOUCH) {   // touch keeps the browser's own scroll: smoother, and no main-thread smoothing loop
  lenis = new Lenis({ duration: 1.15 });
  lenis.on("scroll", ScrollTrigger.update);
  // prioritized: scroll the window before this frame's tween writes, so scrollTo never forces a
  // style + layout flush of a dirty page (same ordering as main.js)
  gsap.ticker.add((t) => lenis.raf(t * 1000), false, true);
  gsap.ticker.lagSmoothing(0);
}

/* ---------- reveals (same as case pages) ---------- */

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

/* ---------- tiles + calendar ---------- */

const EMBED_SRC = "https://asset-tidycal.b-cdn.net/js/embed.js";
const group = document.querySelector(".it-bk-tiles");
const tiles = [...document.querySelectorAll(".it-bk-tile")];
const cal = document.getElementById("it-bk-cal");
const frames = cal.querySelector(".it-bk-frames");
const empty = cal.querySelector(".it-bk-cal-empty");
const picked = cal.querySelector(".it-bk-cal-picked");
const pickedName = cal.querySelector("[data-bk-picked]");
const change = cal.querySelector(".it-bk-change");

let embedLoaded = false;
function loadEmbed() {
  if (embedLoaded) return;
  embedLoaded = true;
  const s = document.createElement("script");
  s.src = EMBED_SRC;
  s.async = true;
  document.body.appendChild(s);
}

function scrollToEl(el, offset = -90) {
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.2 });
  else scrollTo({ top: el.getBoundingClientRect().top + scrollY + offset, behavior: reduced ? "auto" : "smooth" });
}

function pick(type, { scroll = true, focus = false } = {}) {
  const tile = tiles.find((t) => t.dataset.type === type);
  if (!tile) return;
  loadEmbed();

  tiles.forEach((t) => {
    const on = t === tile;
    t.setAttribute("aria-checked", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  group.classList.add("has-pick");

  frames.classList.add("has-pick");
  frames.querySelectorAll(".it-bk-frame").forEach((f) => f.classList.toggle("is-on", f.dataset.frame === type));

  empty.hidden = true;
  picked.hidden = false;
  pickedName.textContent = tile.dataset.name;

  history.replaceState(null, "", "#" + type);
  // the embed grows the page after load; let ScrollTrigger re-measure
  setTimeout(() => ScrollTrigger.refresh(), 600);
  if (scroll) scrollToEl(cal);
  if (focus) tile.focus();
}

tiles.forEach((t, i) => {
  t.tabIndex = i === 0 ? 0 : -1;
  t.addEventListener("click", () => pick(t.dataset.type));
  // radio-group arrow keys
  t.addEventListener("keydown", (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const next = tiles[(i + dir + tiles.length) % tiles.length];
    pick(next.dataset.type, { scroll: false, focus: true });
  });
});

change.addEventListener("click", () => {
  const on = tiles.find((t) => t.getAttribute("aria-checked") === "true") || tiles[0];
  scrollToEl(document.querySelector(".it-bk-pick"));
  on.focus({ preventScroll: true });
});

/* deep link: /book/#deep-press */
{
  const hash = location.hash.slice(1);
  if (tiles.some((t) => t.dataset.type === hash)) {
    pick(hash, { scroll: false });
    // wait a beat for layout before jumping down
    setTimeout(() => scrollToEl(cal), motion ? 500 : 0);
  } else {
    // warm the embed when the browser is idle so the first pick feels instant
    (window.requestIdleCallback || ((fn) => setTimeout(fn, 2500)))(loadEmbed);
  }
}
