/* Imagine TOFU v3 — pixel page transition (AnimMaster pegetr-4, demo 4).
   Leaving: a grid of cells scales in from the edges and covers the page.
   Arriving: the next page opens covered (html.px-in, set by the inline head
   script from a sessionStorage flag) and the cells clear from the center.
   Same-origin page links only; hashes on the same page, new tabs, modifier
   clicks, mailto/tel and downloads are left alone.
   Reduced motion: no transition at all, plain navigation. */

const KEY = "it-px";

export function initPageTransition({ gsap, reduced }) {
  const doc = document.documentElement;
  const clearFlag = () => { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } };

  if (reduced) { doc.classList.remove("px-in"); clearFlag(); return; }

  const overlay = document.createElement("div");
  overlay.className = "it-px";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);

  let cells = [];
  let grid = [1, 1];
  const build = () => {
    const cols = innerWidth < 700 ? 9 : 17;
    const rows = Math.ceil(innerHeight / (innerWidth / cols));
    if (cols * rows === cells.length) return;
    overlay.style.setProperty("--cols", cols);
    overlay.replaceChildren();
    cells = Array.from({ length: cols * rows }, () => {
      const c = document.createElement("i");
      overlay.appendChild(c);
      return c;
    });
    grid = [rows, cols];
  };
  build();

  const cover = () =>
    new Promise((resolve) => {
      build();
      gsap.set(overlay, { visibility: "visible" });
      gsap.fromTo(cells, { scale: 0, opacity: 0 }, {
        scale: 1.03, opacity: 1, duration: 0.25, ease: "power1.in",
        stagger: { grid, from: "edges", each: 0.025 },
        onComplete: resolve,
      });
    });

  const reveal = () => {
    gsap.set(cells, { scale: 1.03, opacity: 1 });
    gsap.set(overlay, { visibility: "visible" });
    doc.classList.remove("px-in"); // the CSS stand-in cover goes, the cells hold
    gsap.to(cells, {
      scale: 0, opacity: 0, duration: 0.25, ease: "power1",
      stagger: { grid, from: "center", each: 0.025 },
      onComplete: () => gsap.set(overlay, { visibility: "hidden" }),
    });
  };

  // arriving through a transition: clear once the first frame can paint
  if (doc.classList.contains("px-in")) {
    clearFlag();
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  }

  // back/forward cache: a restored page must never stay covered
  addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    doc.classList.remove("px-in");
    gsap.set(cells, { scale: 0, opacity: 0 });
    gsap.set(overlay, { visibility: "hidden" });
    leaving = false;
  });

  let leaving = false;
  document.addEventListener("click", (e) => {
    if (leaving || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page (hash)
    e.preventDefault();
    leaving = true;
    cover().then(() => {
      try { sessionStorage.setItem(KEY, "1"); } catch { /* fine */ }
      location.href = url.href;
    });
  });
}
