/* Imagine TOFU v3 — phone performance layer.

   LITE: touch / narrow screens. Sets html.is-lite so CSS can drop the
   effects a phone GPU pays for on every frame (backdrop blur, full-screen
   blend layers, big blurred auras), and tells the scripts to take their
   cheaper paths.

   Governor: every ambient loop (looping GSAP tweens, CSS animations) is
   paused while its section is more than a screen away. Without it a phone
   keeps animating the hero sprouts, cube, marquee and mascots the whole way
   down the page — work nobody can see that still costs style + paint. */

export const LITE = matchMedia("(pointer: coarse), (hover: none), (max-width: 899px)").matches;
// touch screens scroll natively (compositor thread); smooth-scroll libraries only add main-thread work there
export const TOUCH = matchMedia("(pointer: coarse)").matches;

if (LITE) document.documentElement.classList.add("is-lite");

// Firefox on a phone (Oct 24, from Pixel 10 Pro traces): its renderer redraws every screen tile that a
// script changes during a scroll, and on that GPU a full tile redraw costs most of a frame. So in GECKO
// mode every scroll-triggered reveal runs as a CSS transition (Firefox animates those on the compositor,
// no redraw), scroll-scrubbed parallax is dropped, and loops that repaint every frame are paused.
// Chrome / Safari / desktop are untouched. ?x=nogecko turns it off for an A/B on the device.
export const GECKO = LITE && navigator.userAgent.includes("Firefox/") && !/[?&]x=[^&]*nogecko/.test(location.search);
if (GECKO) document.documentElement.classList.add("is-gecko");

const SECTIONS = [
  ["hero", ".it-hero"],
  ["marquee", ".it-marquee"],
  ["intro", ".it-intro"],
  ["work", ".it-work"],
  ["services", ".it-services"],
  ["dream", ".it-dream"],
  ["studio", ".it-studio"],
  ["cta", ".it-cta"],
  ["footer", ".it-footer"],
];

const on = Object.create(null); // name → currently near the viewport
export const isOn = (name) => on[name] !== false;

const WIDE = matchMedia("(min-width: 900px)");

export function initPerf({ gsap }) {
  // desktop keeps every loop running: its hero cube is a fixed element that rides the whole page
  if (!LITE) return;
  const secs = SECTIONS.map(([name, sel]) => ({ name, el: document.querySelector(sel) })).filter((s) => s.el);
  if (!secs.length || !("IntersectionObserver" in window)) return;

  const owner = new WeakMap(); // tween/timeline → the section (or sections) that keep it alive
  const mine = new Set(); // tweens this governor paused (never resume anything it didn't pause)

  const firstTarget = (t) => {
    if (t.targets) return t.targets()[0];
    const kid = t.getChildren?.(true, true, false)[0];
    return kid?.targets?.()[0];
  };
  const ownersOf = (t) => {
    if (owner.has(t)) return owner.get(t);
    const el = firstTarget(t);
    let names = null;
    if (el && el.nodeType === 1) {
      // the hero cube is position:fixed: on a phone it rides on into Hello (alive for both); on a wide
      // layout (tablet landscape) it is parked beside the content all the way down, so never pause it
      if (el.closest?.(".it-cube")) names = WIDE.matches ? null : ["hero", "intro"];
      else {
        const s = secs.find((x) => x.el.contains(el));
        if (s) names = [s.name];
      }
    }
    owner.set(t, names);
    return names;
  };

  function sync() {
    const all = gsap.globalTimeline.getChildren(true, true, true);
    for (const t of all) {
      if (t.repeat?.() !== -1) continue;
      const names = ownersOf(t);
      if (!names) continue;
      const alive = names.some((n) => on[n]);
      if (!alive && !t.paused() && !mine.has(t)) { t.pause(); mine.add(t); }
      else if (alive && mine.has(t)) { t.resume(); mine.delete(t); }
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const e of entries) {
        const s = secs.find((x) => x.el === e.target);
        if (!s) continue;
        const now = e.isIntersecting;
        if (on[s.name] === now) continue;
        on[s.name] = now;
        changed = true;
      }
      if (!changed) return;
      // the cube (a child of the hero) is still on screen in Hello, so the hero's CSS loops follow both
      for (const s of secs) {
        const alive = on[s.name] || (s.name === "hero" && (on.intro || WIDE.matches));
        s.el.classList.toggle("is-off", !alive); // CSS animations pause with it
      }
      sync();
    },
    { rootMargin: "35% 0px 35% 0px" }
  );
  secs.forEach((s) => { on[s.name] = true; io.observe(s.el); });

  // loops created after a section went quiet (delayed starts) get caught on the next pass
  setInterval(() => { if (!document.hidden) sync(); }, 2500);
}

/* ---------- on-device diagnostics (only when the URL has ?perf or ?x=…) ----------
   ?perf            a small readout: fps over the last second, worst frame, which section is on screen
   ?x=blend,canvas  switch whole classes of cost off to find the one that hurts on a real phone:
                    blend (mix-blend-mode) · canvas · video · filter · anim (CSS animations) · fixed (nav, buddy, cube, overlays hidden) · layers (no will-change)
   e.g. imaginetofu.com/?perf&x=blend  — nothing here runs for normal visitors. */
{
  const qs = new URLSearchParams(location.search);
  const xs = (qs.get("x") || "").split(",").filter(Boolean);
  xs.forEach((x) => document.documentElement.classList.add("x-" + x.replace(/\W/g, "")));
  if (qs.has("perf")) {
    addEventListener("DOMContentLoaded", () => {
      const hud = document.createElement("div");
      hud.style.cssText = "position:fixed;left:6px;bottom:6px;z-index:99999;font:11px/1.35 ui-monospace,monospace;color:#9ed9bf;background:rgba(0,0,0,.72);padding:5px 7px;border-radius:6px;pointer-events:none;white-space:pre";
      document.body.appendChild(hud);
      let last = performance.now(), frames = 0, worst = 0, win = performance.now(), slow = 0, shown = 0;
      const names = ["top", "intro", "work", "services", "dream", "studio", "contact"];
      const sec = () => {
        let cur = "hero";
        for (const n of names.slice(1)) { const e = document.getElementById(n) || document.querySelector(".it-" + n); if (e && e.getBoundingClientRect().top < innerHeight * 0.5) cur = n; }
        return cur;
      };
      (function f(t) {
        const d = t - last; last = t; frames++; worst = Math.max(worst, d); if (d > 33) slow++;
        if (t - win >= 1000) {
          shown = frames; hud.textContent = `${shown}fps  worst ${Math.round(worst)}ms  slow ${slow}\n${sec()}  x=${xs.join(",") || "-"}`;
          frames = 0; worst = 0; slow = 0; win = t;
        }
        requestAnimationFrame(f);
      })(last);
    });
  }
}
