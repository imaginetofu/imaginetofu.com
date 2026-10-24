/* Imagine TOFU v3 — work-card motion loops.
   Each real-work card carries a poster (<img>) and a muted scroll loop
   (<video preload="none">). Still by default, motion on demand:
     • fine pointer (desktop): play on hover / focus, pause + rewind on leave
     • coarse pointer (touch): poster only, no autoplay (perf)
   Reduced motion: never attach a source; the poster is the card.
   Sources are attached lazily so eight cards don't cost eight requests. */

export function initWorkCards({ reduced }) {
  const cards = document.querySelectorAll(".it-card[data-loop]");
  if (!cards.length || reduced) return;

  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const arm = (card) => {
    const video = card.querySelector(".it-shot-loop");
    if (!video || video.dataset.armed) return video;
    video.dataset.armed = "1";
    const base = card.dataset.loop; // e.g. /work/lemonadmedia/card
    const webm = document.createElement("source");
    webm.src = base + ".webm";
    webm.type = "video/webm";
    const mp4 = document.createElement("source");
    mp4.src = base + ".mp4";
    mp4.type = "video/mp4";
    video.append(webm, mp4);
    video.addEventListener("playing", () => card.classList.add("is-playing"));
    video.addEventListener("error", () => card.classList.add("is-still"), true);
    video.load();
    return video;
  };

  const play = (card) => {
    const v = arm(card);
    if (!v) return;
    v.play().catch(() => card.classList.add("is-still"));
  };
  const stop = (card, rewind = true) => {
    const v = card.querySelector(".it-shot-loop");
    if (!v) return;
    v.pause();
    card.classList.remove("is-playing");
    if (rewind) { try { v.currentTime = 0; } catch { /* not loaded yet */ } }
  };

  if (fine) {
    cards.forEach((card) => {
      card.addEventListener("pointerenter", () => play(card));
      card.addEventListener("pointerleave", () => stop(card));
      card.addEventListener("focusin", () => play(card));
      card.addEventListener("focusout", () => stop(card));
    });
    return;
  }

  // touch: posters only. The loops used to start when a card settled in view; on a phone that is a
  // network fetch + video decode competing with the scroll, for a clip that plays a few seconds.
}
