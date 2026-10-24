/* Imagine TOFU v3 — case-study "works" gallery.
   A combo of two AnimMaster references:
     scroll-57 (Selected Works Reveal): big frames on an offset editorial grid,
       each one de-pixelates in steps as it arrives.
     scroll-11 (Northern Expeditions): a band of ink squares sweeps down the
       frame and leaves the image behind it.
   Frames marked .it-cs-clip hold a recorded motion clip: the poster is
   revealed, then the video plays (only while on screen).
   One frame per page (.it-cs-auto) is the full homepage, auto-scrolling top to
   bottom inside a browser frame, with a little scrollbar showing where it is.
   No hover effects at all. Reduced motion: frames show at once and the full
   page frame becomes a normal scrollable box. */

import { media } from "./media.js";
import { LITE } from "./perf.js";

const STEPS = [0.025, 0.05, 0.08, 0.14, 1]; // pixel scale per step (scroll-57: 2,5,6,8,100%)
const CELL = 22;   // CSS px, size of the sweeping squares (scroll-11 grid)
const BAND = 0.22; // band height as a fraction of the frame
const DUR = 1100;  // ms for the whole reveal

const rand = (x, y) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/* object-fit: cover, object-position: top */
function coverRect(img, w, h) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const ir = iw / ih, fr = w / h;
  if (ir > fr) { const sw = ih * fr; return [(iw - sw) / 2, 0, sw, ih]; }
  return [0, 0, iw, iw / fr];
}

function reveal(host, img, ink) {
  return new Promise((done) => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const cv = document.createElement("canvas");
    cv.className = "it-cs-px-canvas";
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    host.appendChild(cv);
    const ctx = cv.getContext("2d");
    const buf = document.createElement("canvas");
    const bctx = buf.getContext("2d");
    const src = coverRect(img, w, h);
    const cols = Math.ceil(w / CELL), rows = Math.ceil(h / CELL);
    let step = -1;
    const t0 = performance.now();

    const frame = (now) => {
      const t = Math.min(1, (now - t0) / DUR);
      // pixel step follows time (a touch ahead of the sweep)
      const k = Math.min(STEPS.length - 1, Math.floor(Math.pow(t, 0.8) * STEPS.length));
      if (k !== step) {
        step = k;
        const s = STEPS[k];
        buf.width = Math.max(1, Math.round(cv.width * s));
        buf.height = Math.max(1, Math.round(cv.height * s));
        bctx.imageSmoothingEnabled = s >= 1;
        bctx.drawImage(img, src[0], src[1], src[2], src[3], 0, 0, buf.width, buf.height);
      }
      // the sweep front runs from above the frame to below it
      const front = -BAND + t * (1 + BAND * 2);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const revealH = Math.max(0, Math.min(1, front)) * cv.height;
      if (revealH > 0) {
        ctx.imageSmoothingEnabled = STEPS[step] >= 1;
        ctx.drawImage(buf, 0, 0, buf.width, buf.height * (revealH / cv.height), 0, 0, cv.width, revealH);
      }
      // ink squares, dense at the front, scattering behind it
      ctx.fillStyle = ink;
      const cs = CELL * dpr;
      for (let y = 0; y < rows; y++) {
        const gy = (y + 0.5) / rows;
        const d = front - gy; // >0: already revealed
        if (d < -BAND * 0.35 || d > BAND) continue;
        const near = 1 - Math.abs(d) / BAND;
        for (let x = 0; x < cols; x++) {
          if (rand(x, y) + near * 0.9 > 1.05) ctx.fillRect(x * cs, y * cs, cs + 0.5, cs + 0.5);
        }
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        host.classList.add("is-revealed");
        cv.style.opacity = "0";
        setTimeout(() => cv.remove(), 300);
        done();
      }
    };
    requestAnimationFrame(frame);
  });
}

function autoScroll(gsap, ScrollTrigger, frame, reduced) {
  const view = frame.querySelector(".it-cs-auto-view");
  const img = view?.querySelector("img");
  const thumb = frame.querySelector(".it-cs-auto-bar i");
  if (!view || !img) return;
  if (reduced) { frame.classList.add("is-manual"); return; }
  let tl = null;
  const build = () => {
    tl?.kill();
    gsap.set(img, { y: 0 });
    const vh = view.clientHeight;
    const ih = img.getBoundingClientRect().height;
    const dist = Math.max(0, ih - vh);
    if (thumb) gsap.set(thumb, { height: Math.max(8, (vh / ih) * 100) + "%", yPercent: 0, top: 0 });
    if (!dist) return;
    const speed = view.clientWidth * 0.15; // px per second, scales with the frame (0.11 until Oct 24: a little faster)
    const prog = { p: 0 };
    const apply = () => {
      gsap.set(img, { y: -dist * prog.p });
      if (thumb) thumb.style.top = (prog.p * (100 - parseFloat(thumb.style.height))) + "%";
    };
    tl = gsap.timeline({ repeat: -1, paused: true, onUpdate: apply })
      .to(prog, { p: 1, duration: dist / speed, ease: "sine.inOut", onUpdate: apply }, 1.2)
      .to(prog, { p: 0, duration: 1.8, ease: "power3.inOut", onUpdate: apply }, "+=1.6")
      .to({}, { duration: 0.4 });
  };
  const host = view;
  const ready = () => img.complete && img.naturalWidth > 0;
  if (ready()) build(); else img.addEventListener("load", build, { once: true });
  let visible = false;
  const go = () => {
    if (!visible || !host.classList.contains("is-revealed")) return tl?.pause();
    if (!tl && ready()) build();
    tl?.play();
  };
  ScrollTrigger.create({
    trigger: frame, start: "top bottom", end: "bottom top",
    onToggle: (self) => { visible = self.isActive; go(); },
  });
  frame.addEventListener("it-revealed", go);
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const was = tl && !tl.paused(); build(); if (was) tl.play(); }, 200); });
}

export function initCaseWorks({ gsap, ScrollTrigger, reduced }) {
  const works = document.querySelector(".it-cs-works");
  if (!works) return;
  const ink = getComputedStyle(document.body).getPropertyValue("--it-ground").trim() || "#1a1a1a";
  const frames = [...works.querySelectorAll(".it-cs-work")];

  // motion clips: the poster <img> is revealed, then the <video> takes over
  // and plays only while it is on screen
  const clipIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target.querySelector("video");
      if (!v || !v.src) continue;
      if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
    }
  }, { threshold: 0.15 }) : null;
  const startClip = (host) => {
    const v = host.querySelector("video[data-clip]");
    if (!v) return;
    v.src = media(v.dataset.clip);
    v.addEventListener("playing", () => host.classList.add("is-playing"), { once: true });
    if (reduced || !clipIO) { v.controls = true; host.classList.add("is-playing"); return; }
    clipIO.observe(host);
    v.play().catch(() => {});
  };

  frames.forEach((fig) => {
    const host = fig.querySelector(".it-cs-px");
    const img = host?.querySelector("img");
    if (fig.classList.contains("it-cs-work--auto")) autoScroll(gsap, ScrollTrigger, fig, reduced);
    if (!host || !img) return;
    img.addEventListener("error", () => host.classList.add("is-pending"), { once: true });
    if (reduced) { host.classList.add("is-revealed"); startClip(host); return; }
    // start loading a screen early, reveal when it is well inside the view
    ScrollTrigger.create({ trigger: host, start: "top bottom+=60%", once: true, onEnter: () => { img.loading = "eager"; } });
    ScrollTrigger.create({
      trigger: host, start: LITE ? "top 92%" : "top 82%", once: true,
      onEnter: async () => {
        try { await img.decode(); } catch { /* broken or pending */ }
        if (!img.naturalWidth) { host.classList.add("is-revealed"); startClip(host); return; }
        // phones: a plain fade once the image is decoded. The pixel sweep redraws a full-frame canvas
        // (plus a downscaled copy of the capture) every frame for a second, right while the page scrolls.
        if (LITE) {
          host.classList.add("is-fade");
          await new Promise((res) => requestAnimationFrame(() => { host.classList.add("is-revealed"); setTimeout(res, 600); }));
        } else await reveal(host, img, ink);
        startClip(host);
        fig.dispatchEvent(new Event("it-revealed"));
      },
    });
  });

  // captions rise in line by line (scroll-11 text mask), once
  if (!reduced) {
    works.querySelectorAll(".it-cs-work figcaption > span").forEach((cap) => {
      gsap.fromTo(cap, { yPercent: 110 }, {
        yPercent: 0, duration: 0.9, ease: "expo.out",
        scrollTrigger: { trigger: cap.parentElement, start: "top 94%", once: true },
      });
    });
  }
}
