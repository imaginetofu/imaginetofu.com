/* Imagine TOFU v3 — custom cursor (fine pointers, motion-ok only). */

import gsap from "gsap";

export function initCursor({ reduced }) {
  if (reduced || !matchMedia("(pointer: fine)").matches) return;

  const dot = document.querySelector(".it-cursor-dot");
  const ring = document.querySelector(".it-cursor-ring");
  if (!dot || !ring) return;

  document.documentElement.classList.add("cursor-on");
  gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });

  const rx = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
  const ry = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });

  let shown = false;
  addEventListener(
    "pointermove",
    (e) => {
      if (!shown) {
        shown = true;
        gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
        gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
      }
      gsap.set(dot, { x: e.clientX, y: e.clientY });
      rx(e.clientX);
      ry(e.clientY);
    },
    { passive: true }
  );

  document.addEventListener("pointerleave", () =>
    gsap.to([dot, ring], { opacity: 0, duration: 0.3 })
  );
  document.addEventListener("pointerenter", () => {
    if (shown) gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
  });

  const HOVERS = "a, button, .it-card, .it-service-row, .it-buddy";
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(HOVERS)) {
      ring.classList.add("is-hover");
      gsap.to(ring, { scale: 1.5, duration: 0.35, ease: "power3.out" });
    }
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(HOVERS)) {
      ring.classList.remove("is-hover");
      gsap.to(ring, { scale: 1, duration: 0.35, ease: "power3.out" });
    }
  });
}
