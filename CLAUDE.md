# Imagine TOFU v3 — portfolio site

## What this is
The Imagine TOFU studio portfolio one-pager ("imagination, in full bloom").
Vite + vanilla JS + GSAP 3 + ScrollTrigger + Lenis. Vercel-deployable as-is.
Run: `npm run dev` (port 5602).

## Rules that always apply
- Brand system: the global `imagine-tofu-design-system` skill governs this
  build. Unlike v2, the **locked decisions are IN FORCE here** — aura
  parameters, hero text bottom-left, no full 360° rotation of any element,
  eye color, corner mascot state.
- Only token colors (`src/styles/tokens.css`); derived tints via color-mix
  of tokens only.
- All non-essential motion is gated behind `prefers-reduced-motion`
  (CSS kills ambient loops; JS skips Lenis/GSAP choreography entirely).

## Locked-decision interpretations (chosen in this build)
The skill locks these decisions but doesn't record values; v3 uses the
following interpretations — keep them stable unless Dennis says otherwise:
- **Corner state position:** fixed bottom-right, `clamp(14px, 2.4vw, 30px)` inset.
- **Idle pool weighting:** blink 70% / glance 20% / squish 10%, every 3.6–6.4s.
- **Sleep threshold:** 45s without scroll/pointer/key input → lids close + zzz.
- **Z-index swap delay:** 150ms delay before the buddy dims to 30% over the footer.
- **Hero text position:** Dennis override (Jul 2026) — vertically centered
  middle-left (the skill's bottom-left lock is consciously superseded here).
- **Cube + particles anchor:** pinned via JS to the hero video's glow origin
  (`glowPoint()` cover-crop math in motion.js), not CSS percentages.

## Living-tofu kit (hero cube behaviors, Jul 8 2026 session)
- Float ±10px + jiggle (squash/elastic, 3.2–5.8s cadence, brightness surge).
- Drift: cube x follows the vortex tip sway — TIP_SWAY keyframes in
  motion.js, synced to video.currentTime.
- Blink: crossfade to `/brand/tofu-cube-blink.webp` (closed-eye frame,
  composited in Cowork from Dennis's Nano Banana gen — open frame fades
  OUT in lockstep). Calm cadence: 0.18s close / 0.6s hold (20% 1.3s) /
  0.32s open. Auto-disabled if the asset is missing.
- Marquee: JS-driven, hover eases to a crawl; separator dots are tiny
  tofu (eyes via pseudo-elements) with staggered squish.
- Sprouts: soybean-seedling line art (2 cotyledons + true-leaf pair +
  peach seed coat); classes/animations unchanged.
- Known quirk: mix-blend over the <video> can fail until a repaint —
  fixed via recomposite nudge after `playing` + isolation on .it-hero.

## Page flow (Oct 2026)
Hero → Marquee → (01) Hello → (02) Work (pinned horizontal gallery, 8 real
cards + teaser, each linking to a Vite MPA case page under /work/) → (03) What
we do → (04) After dark (glass meadow pin, `src/dream-glass.js`) → (05) Studio
→ (06) Say hello → Footer.

## (02) Work + case pages (Oct 21 2026)
- Cards 01–07: Lion Card, National Entity, Lemonad Media, Tramokyo, Vision
  Quest, Omega GTI, Mariposa, then the teaser (08). Elegant Tech was removed
  (Oct 21); add it back as a normal card if the site returns. The capture IS the art (`.it-art-shot`,
  16:10): poster `card.webp` + muted scroll loop `card.webm|mp4`, still by
  default, plays on hover (fine pointer) or in view (touch) via
  `src/work-cards.js`; sources attach lazily; never under reduced motion.
- Assets per site in `public/work/<slug>/`: hero-desktop/mobile.webp,
  full-desktop/mobile.webp, card.webp|webm|mp4, scroll.webm|mp4 (14s eased
  homepage scroll, 1280×800), hl-{hero,nav,cta,reveal}.webm|mp4 (4–8s
  interaction loops, 960×600), before/after.webp where a "before" exists
  (Lion Card, Mariposa).
- Case pages (v2, Oct 21 evening) share `src/case.js` + `src/styles/case.css`:
  hero (mono index, title, one line, cover capture with scroll parallax,
  hairline facts row) → story as CSS-sticky stacking cards that recede as
  the next lands (AnimMaster scroll-38, tamed: no flips, no elastic) → ONE
  pin: `.it-cs-scrub-pin` (+220%) seeks `scroll-scrub.mp4` (20fps, keyint 6)
  with scroll progress on fine pointers; coarse/reduced get the in-view
  `scroll.webm|mp4` instead → drift gallery: JS deals `.it-cs-item`s into
  per-column wrappers that lag the scroll by different amounts (AnimMaster
  grid-3 mechanics on Lenis, not ScrollSmoother; clamp ±140px) + magnetic
  tilt on hover (hover-19) → outcome → next case. Any `[data-src]` video
  host is lazy-attached (HEAD .webm → .mp4, else `.is-pending`).
- Per site also: `crop-1..3.webp` (16:10 windows picked by edge density
  from the full-page capture) and `scroll-scrub.mp4`.
- Captures were made headless (Playwright 1440×900 / 390×844@2x) with
  cookie bars and promo pop-ups removed; Omega GTI is captured from the
  wpdns.site preview, not omegagti.com. Story copy on every case page is a
  DRAFT marked `DENNIS:` in comments. Full status + decisions live in the Cowork project doc
`portfolio-v3-status.md`; this file is the short version.

## (03) What we do — code-drawn windows (Oct 21 2026)
Three `.it-tile` scene windows (Build / Move / Tend) + glass panels; no step
cards or process rail anymore (Dennis cut them — Hello already tells the
process). The pictures are DRAWN BY CODE: `src/tile-art.js` samples each
tile's hidden source (`public/dream/tiles/{build,motion,care}.webp` poster +
480×640 `.webm/.mp4` loop, never shown) on a coarse grid and redraws it every
frame as a pixel mosaic (`data-art="pixel"` on `.it-tiles`; `"ascii"` also
exists) in token mixes only. Rationale: After Dark stays the one place AI
video is the material; the services read as code. Reduced motion = one
static frame, videos display:none. Cursor light (`--mx/--my`), per-tile aura
at the locked params, scroll drift on the canvas, care tile links to
tofupress.host with the peeking tofu (joy + blink frames).

## Motion inventory (all within brand anti-cheese constraints)
- Preloader: the mold press (tofu edge-rolls a 3×3 mold, nine fuse, blink)
  then the VORTEX BLOOM (Oct 22 2026): `.it-hero-cosmos` starts as an 8%
  orb pinned to the pressed tofu (scaled around the glow point), grows to
  full frame over 2.4s (`itBloom` ease) behind a radial + edge-feather mask
  (`--bloom-r`, `--bloom-e`), the curtain ground thins via `--pre-bg`. The
  little tofu crossfades out in 0.35s and the HERO cube takes over on the
  spot: `.it-cube.is-blooming` drives individual translate/scale on the
  media + ::before glow from `--bloom-x/-y/-s/-glow` (needs !important,
  GSAP writes inline translate/scale: none), growing from tofu size to full
  as it rides the glow. heroIntro starts at 1.25s. `dissolve()` is the old
  fade, kept as fallback.
- Hero: sprout stroke-draw, masked line reveals (0.09s stagger token),
  blur-in sub, mascot float ±10px (never spins), aura 26s rotation +
  breathing 0.34–0.5, rotating word in sub line.
- Scroll: pinned horizontal work gallery (desktop), scrubbed word-reveal
  intro statement, code-drawn service windows, glass-meadow dream pin,
  magnetic CTA button, corner buddy behaviors.

## Assets
- Hero bg: `/public/dream/hero.webm|mp4` — AI-generated cosmic-swirl loop
  (Nano Banana still → Seedance/ArtCraft i2v, end-frame=start for native
  loop; stabilized, 2× upscaled in Cowork; prompts in
  `notes/hero-bg-prompts.md`). Re-encoded Oct 22 2026 from
  `notes/hero-cosmic-swirl-v2-source.mkv` (5K): white letterbox rows
  cropped, 0.7s crossfade baked at the loop seam (now 9.25s, 24fps),
  VP9 crf31 / x264 crf21. GLOW + TIP_SWAY + LOOP_DUR in motion.js were
  re-mapped to match; old files in `notes/backup-pre-vortex-bloom/`. Glow origin ≈72%/54% — cube's is-fixed rest
  pose (71%) rides it. Poster/reduced/mobile still: `/dream/cosmos.webp`
  (old galaxy kept as `cosmos-galaxy-old.webp`). Desktop-only via JS gate.
- `/public/brand/*` renders copied from `mockups/imagine-tofu-v2` (navy-ground
  PS2 renders, seated with a radial mask + slight saturate). No ffmpeg on this
  machine → GIF loop swapped in over the PNG poster, frozen off-screen via
  IntersectionObserver.
- Work-card "covers" are CSS gradient/SVG art (token colors only) — no stock.

## /book/ booking page (Oct 22 2026)
`book/index.html` + `src/book.js` + `src/styles/book.css` (Vite input `book`).
Every "Book a call" CTA now points to `/book/` (same tab). Three tiles act as a
radio group (Project chat 30m · Deep press 60m · Care check-in 30m, all free);
picking one shows that type's TidyCal embed (`imaginetofu/<slug>`, all three
render in one embed.js pass, warmed on idle). `/book/#deep-press` etc. preselect.
TidyCal side: theme "Imagine TOFU" (dark, mint #9ED9BF on #0f1814, Crimson Pro /
Nunito Sans, the closest TidyCal fonts to Fraunces / Hanken) on the booking page
and each type; all three types use the "Studio hours" schedule (weekdays 10-5 PT);
per-type daily caps 2/1/1.

## Copy voice
Warm, plain-spoken, no-pressure. "Soft on the pitch, firm on the follow-through."
Real links: /book/ (TidyCal at book.imaginetofu.com) · dennis@imaginetofu.com. No fabricated
testimonials, stats, or social links.

## Type refresh (Oct 22 2026, Dennis override of the skill's Fraunces-display lock)
- Headings: **Bricolage Grotesque** (`--it-font-display`). Italic accent words
  in headings switch to **Fraunces italic** (`--it-font-accent`), since
  Bricolage has no true italic and the serif ties back to the wordmark.
- Eyebrows: Fraunces italic, lowercase, mint, led by the logo spark
  (`--it-spark-mask`). No "( 01 ) —" numbering anywhere. The hero's mono
  location eyebrow was removed (option C); "San Leandro" now lives in the
  hero sub line. Case pillar labels match; figcaption numbers removed;
  service pills read build / move / tend.
- Numbers kept only where they count: work card index, "Case study 04 / 07".
- Pre-change copies: `notes/backup-pre-bricolage/`.
