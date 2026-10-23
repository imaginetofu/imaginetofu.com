/* Imagine TOFU v3 — gooey hover on the work cards (AnimMaster webgl-3,
   the codrops "gooey" shader, rebuilt on raw WebGL: no three.js).
   One shared canvas hops into whichever card is hovered. It draws the
   poster, and a noisy blob that follows the cursor reveals the card's
   scroll loop (the <video> work-cards.js already plays on hover) through it.
   Fine pointers only, motion only, WebGL only; everywhere else the cards
   keep their plain poster → loop crossfade. */

const VERT = `
attribute vec2 a;
varying vec2 vUv;
void main() {
  vUv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5); // top-left origin, like the DOM
  gl_Position = vec4(a, 0.0, 1.0);
}`;

// Ashima simplex 3D noise (MIT) + the gooey reveal
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap;
uniform sampler2D uHover;
uniform vec2 uMapScale;
uniform vec2 uHoverScale;
uniform vec2 uMouse;
uniform vec2 uRes;
uniform float uHoverP;
uniform float uHasVideo;
uniform float uTime;
uniform vec2 uSquash;  // jiggle: x stretch, y squash (spring-driven in JS)
uniform float uTilt;   // jiggle: lean toward the direction of travel

vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

// rounded hexagon, pointy top: a cube seen corner-on (the tofu silhouette)
float sdHex(vec2 p, float r){
  p = p.yx;
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

// object-fit: cover, object-position: top
vec2 cover(vec2 uv, vec2 s){ return vec2((uv.x - 0.5) * s.x + 0.5, uv.y * s.y); }

void main(){
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  float t = uTime * 0.05;

  // the blob: a little tofu cube at the cursor. Hexagon silhouette (a cube
  // seen corner-on), soft corners, edge lightly chewed by moving noise, and a
  // spring jiggle (squash/stretch + lean) fed from JS.
  vec2 p = uv - uMouse; p.x *= asp; p.y = -p.y;           // y up
  float ct = cos(uTilt), st = sin(uTilt);
  p = mat2(ct, -st, st, ct) * p;
  // squash from the base: the cube sits on its bottom point when it jiggles
  float R = 0.19 * uHoverP;
  p.y += R; p /= uSquash; p.y -= R;
  float offX = uv.x + sin(uv.y + t * 2.0);
  float offY = uv.y - t * 0.2 - cos(t * 2.0) * 0.1;
  float n  = snoise(vec3(offX * asp, offY, t * 0.5) * 6.0) * uHoverP;
  float nh = snoise(vec3(offX, offY, t * 0.5) * 2.0) * 0.1;
  float sd = sdHex(p, max(R - 0.03, 0.0)) - 0.03 * uHoverP + n * 0.006;
  float c = (1.0 - smoothstep(-0.004, 0.004, sd)) * step(0.001, uHoverP);  // the cube shows at once, video or not

  // poster: a slow push-in plus a whisper of cursor parallax
  vec2 um = (uv - 0.5) * (1.0 - uHoverP * 0.06) + 0.5 + (uMouse - 0.5) * 0.03 * uHoverP;
  vec4 img = texture2D(uMap, cover(um, uMapScale));

  // the loop, inside the blob, wobbling with the low-frequency noise
  vec2 uh = (uv - 0.5) * (1.0 - uHoverP * 0.1) + 0.5 + vec2(nh) * uHoverP;
  vec4 hov = texture2D(uHover, cover(uh, uHoverScale));
  hov.rgb = mix(hov.rgb, hov.rgb * vec3(0.78, 0.94, 0.88), 0.35); // a breath of mint
  // until the loop has a frame, the cube is filled with a lifted poster so it
  // never waits on the network to appear
  hov.rgb = mix(mix(img.rgb, vec3(0.945, 0.918, 0.851), 0.2), hov.rgb, uHasVideo);

  // read the cube in 3D: top face lifts toward cream, right face drops into
  // shadow, left face stays true; a thin cream rim catches the edge
  float top = step(abs(p.x) * 0.57735, p.y);
  float right = (1.0 - top) * step(0.0, p.x);
  hov.rgb = mix(hov.rgb, vec3(0.945, 0.918, 0.851), 0.14 * top);
  hov.rgb *= 1.0 - 0.16 * right;
  float seam = (1.0 - smoothstep(0.0, 0.0035, abs(p.y - abs(p.x) * 0.57735))) * step(-0.001, p.y)
             + (1.0 - smoothstep(0.0, 0.0035, abs(p.x))) * step(p.y, 0.0);
  hov.rgb = mix(hov.rgb, vec3(0.945, 0.918, 0.851), 0.22 * seam);
  float rim = 1.0 - smoothstep(0.0, 0.006, abs(sd));
  vec3 col = mix(img.rgb, hov.rgb, c);
  col = mix(col, vec3(0.945, 0.918, 0.851), 0.5 * rim * uHoverP);
  gl_FragColor = vec4(col, 1.0);
}`;

export function initGooeyCards({ gsap, reduced }) {
  if (reduced) return;
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const cards = [...document.querySelectorAll(".it-card[data-loop] .it-art-shot")].map((art) => art.closest(".it-card"));
  if (!cards.length) return;

  const canvas = document.createElement("canvas");
  canvas.className = "it-gooey";
  canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: false });
  if (!gl) return;

  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn("[gooey] shader failed, plain hover kept", err);
    return;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aLoc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(aLoc);
  gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ["uMap", "uHover", "uMapScale", "uHoverScale", "uMouse", "uRes", "uHoverP", "uHasVideo", "uTime", "uSquash", "uTilt"].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
  gl.uniform1i(U.uMap, 0);
  gl.uniform1i(U.uHover, 1);

  const tex = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([15, 24, 20, 255]));
    return t;
  };
  const tMap = tex();
  const tHover = tex();

  const state = { hover: 0, mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5 };
  // tofu jiggle: a damped spring (s) kicked on landing and by movement;
  // lean follows horizontal speed. Same feel as the After Dark tofu, smaller.
  const jig = { s: 0, v: 0, lean: 0, lastT: performance.now(), lx: 0.5, ly: 0.5 };
  let active = null; // { card, art, img, video }
  let running = false;
  const t0 = performance.now();

  // cover scale for a media of (w,h) in a box of (W,H): the uv span to sample
  const coverScale = (w, h, W, H) => {
    const rm = w / h, rb = W / H;
    return rm > rb ? [rb / rm, 1] : [1, rm / rb];
  };

  const size = () => {
    if (!active) return;
    const r = active.art.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, r.width, r.height);
  };
  addEventListener("resize", size, { passive: true });

  const frame = () => {
    if (!active) { running = false; return; }
    state.mx += (state.tx - state.mx) * 0.12;
    state.my += (state.ty - state.my) * 0.12;
    const now = performance.now();
    const dt = Math.min(0.05, (now - jig.lastT) / 1000);
    jig.lastT = now;
    const vx = (state.mx - jig.lx) / Math.max(dt, 1e-3), vy = (state.my - jig.ly) / Math.max(dt, 1e-3);
    jig.lx = state.mx; jig.ly = state.my;
    const speed = Math.hypot(vx, vy);
    jig.v += speed * 0.9 * dt * 60 * 0.02;               // movement keeps it wobbling
    jig.v += (-140 * jig.s - 9 * jig.v) * dt;            // spring: stiff, lightly damped
    jig.s += jig.v * dt;
    jig.s = Math.max(-0.6, Math.min(0.6, jig.s));
    jig.lean += (Math.max(-0.35, Math.min(0.35, -vx * 0.12)) - jig.lean) * 0.15;
    gl.uniform2f(U.uSquash, 1 + jig.s * 0.22, 1 - jig.s * 0.22);
    gl.uniform1f(U.uTilt, jig.lean);
    const { img, video, art } = active;
    const r = art.getBoundingClientRect();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tHover);
    const hasVideo = video && video.readyState >= 2 && video.videoWidth > 0;
    if (hasVideo) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.uniform2fv(U.uHoverScale, coverScale(video.videoWidth, video.videoHeight, r.width, r.height));
    }
    gl.uniform1f(U.uHasVideo, hasVideo ? 1 : 0);
    gl.uniform2f(U.uMouse, state.mx, state.my);
    gl.uniform1f(U.uHoverP, state.hover);
    gl.uniform1f(U.uTime, (performance.now() - t0) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(frame);
  };

  const enter = (card, e) => {
    const art = card.querySelector(".it-art-shot");
    const img = art?.querySelector(".it-shot-poster");
    if (!art || !img || art.classList.contains("is-pending")) return;
    if (!img.complete || !img.naturalWidth) return; // poster not in yet: plain hover this time
    const video = art.querySelector(".it-shot-loop");
    if (active && active.card !== card) leave(active.card, true);
    active = { card, art, img, video };
    art.appendChild(canvas);
    size();
    const r = art.getBoundingClientRect();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.uniform2fv(U.uMapScale, coverScale(img.naturalWidth, img.naturalHeight, r.width, r.height));
    if (e) {
      state.tx = state.mx = (e.clientX - r.left) / r.width;
      state.ty = state.my = (e.clientY - r.top) / r.height;
    }
    card.classList.add("is-gooey");
    jig.s = 0; jig.v = 5.5; jig.lean = 0; jig.lastT = performance.now(); jig.lx = state.mx; jig.ly = state.my; // land with a boing
    gsap.to(state, { hover: 1, duration: 0.6, ease: "power2.inOut", overwrite: true });
    if (!running) { running = true; requestAnimationFrame(frame); }
  };

  const leave = (card, instant) => {
    if (!active || active.card !== card) return;
    const done = () => {
      if (active && active.card === card) active = null;
      card.classList.remove("is-gooey");
      canvas.remove();
    };
    if (instant) { gsap.killTweensOf(state); state.hover = 0; done(); return; }
    gsap.to(state, { hover: 0, duration: 0.5, ease: "power2.inOut", overwrite: true, onComplete: done });
  };

  cards.forEach((card) => {
    card.addEventListener("pointerenter", (e) => enter(card, e));
    card.addEventListener("pointerleave", () => leave(card));
    card.addEventListener("pointermove", (e) => {
      if (!active || active.card !== card) return enter(card, e);
      const r = active.art.getBoundingClientRect();
      state.tx = (e.clientX - r.left) / r.width;
      state.ty = (e.clientY - r.top) / r.height;
    });
  });
  document.documentElement.classList.add("has-gooey");
}
