/*!
 * Cymatics - plate, sand, and tone
 * https://github.com/evoluteur/cymatics
 * (c) 2026 Olivier Giulieri - MIT license
 */

const $ = (id) => document.getElementById(id);

const state = {
  shape: "square",
  size: 0.3, // metres: the side of the plate, or the diameter of the drum
  mix: -1, // superposition of the two degenerate square modes
  grains: 20000,
  render: "sand",
  mode: null,
  modes: [],
  frequency: 340,
};

let grains = [];
let field = null; // offscreen canvas holding the standing wave
let running = false;

// --- the plate, sampled once per mode ----------------------------------

// The sand asks the plate where its nodes are about 100,000 times a frame.
// Instead of summing a Bessel series every time, the standing wave and its
// slope are sampled once per mode on a grid, and each grain reads them back
// by bilinear interpolation: a few array reads instead of five evaluations.
const GRID = 320; // samples across the plate
const PAD = 2; // margin, so the slope is defined right up to the rim
const SPAN = GRID + 2 * PAD;
const wave = {
  v: new Float32Array(SPAN * SPAN), // amplitude
  vx: new Float32Array(SPAN * SPAN), // its slope along x
  vy: new Float32Array(SPAN * SPAN), // and along y
};

// The mode shape, continued past the drum's rim so that its slope there is
// the true one rather than a cliff into NaN.
const rawAmplitude = (x, y) => {
  if (state.shape === "square") return amplitudeAt(state, x, y);
  const dx = x * 2 - 1;
  const dy = y * 2 - 1;
  const { m: n, n: s } = state.mode;
  return besselJ(n, zeroOf(n, s) * Math.hypot(dx, dy)) * Math.cos(n * Math.atan2(dy, dx));
};

const sampleWave = () => {
  const { v, vx, vy } = wave;
  const d = 1 / (GRID - 1);
  for (let j = 0; j < SPAN; j++) {
    for (let i = 0; i < SPAN; i++) v[j * SPAN + i] = rawAmplitude((i - PAD) * d, (j - PAD) * d);
  }
  vx.fill(0);
  vy.fill(0);
  for (let j = 1; j < SPAN - 1; j++) {
    for (let i = 1; i < SPAN - 1; i++) {
      const k = j * SPAN + i;
      vx[k] = (v[k + 1] - v[k - 1]) / (2 * d);
      vy[k] = (v[k + SPAN] - v[k - SPAN]) / (2 * d);
    }
  }
};

// --- the sand ----------------------------------------------------------

const inside = (x, y) =>
  state.shape === "square"
    ? x >= 0 && x <= 1 && y >= 0 && y <= 1
    : (x - 0.5) * (x - 0.5) + (y - 0.5) * (y - 0.5) <= 0.25;

const scatter = () => {
  grains = [];
  while (grains.length < state.grains) {
    const x = Math.random();
    const y = Math.random();
    // a fixed sub-grain offset, so a settled line keeps the width of sand
    if (inside(x, y))
      grains.push({
        x,
        y,
        ox: (Math.random() - 0.5) * 0.006,
        oy: (Math.random() - 0.5) * 0.006,
        settled: false,
      });
  }
  wake();
};

// a new figure: every grain has to look for its node again
const unsettle = () => {
  for (const g of grains) g.settled = false;
  wake();
};

// The distance from a grain to the nearest nodal line, and the direction
// away from it. Dividing the amplitude by its own slope turns "small
// amplitude" into "close to a node", which behaves the same whether the wave
// is steep (the middle of a drumhead) or shallow (its rim). The amplitude and
// slope are interpolated with their sign, so a node that falls between two
// samples is still found exactly.
const node = { distance: 0, gx: 0, gy: 0 };
const toNode = (x, y) => {
  const { v, vx, vy } = wave;
  const fx = x * (GRID - 1) + PAD;
  const fy = y * (GRID - 1) + PAD;
  const i = Math.min(fx | 0, SPAN - 3);
  const j = Math.min(fy | 0, SPAN - 3);
  const tx = fx - i;
  const ty = fy - j;
  const k = j * SPAN + i;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const a = v[k] * w00 + v[k + 1] * w10 + v[k + SPAN] * w01 + v[k + SPAN + 1] * w11;
  const ax = vx[k] * w00 + vx[k + 1] * w10 + vx[k + SPAN] * w01 + vx[k + SPAN + 1] * w11;
  const ay = vy[k] * w00 + vy[k + 1] * w10 + vy[k + SPAN] * w01 + vy[k + SPAN + 1] * w11;
  const slope = Math.hypot(ax, ay) + 1e-9;
  const sign = a < 0 ? -1 : 1; // the slope of |amplitude| points away from the node
  node.distance = Math.min(Math.abs(a) / slope, 1);
  node.gx = (sign * ax) / slope;
  node.gy = (sign * ay) / slope;
  return node;
};

// One step of the real story: a grain is thrown around where the plate
// moves and stays put where it does not, so it walks downhill to a node.
// Returns how far the most restless grain moved, so the loop knows when the
// figure has finished forming.
const shake = () => {
  const step = 0.006;
  const jitter = 0.1;
  const reach = 0.09; // how far a grain still feels the plate moving
  let moved = 0;
  for (const g of grains) {
    if (g.settled) continue;
    const { distance, gx, gy } = toNode(g.x, g.y);
    if (distance < 0.0012) {
      g.settled = true; // on a nodal line: it will not move until the figure changes
      continue;
    }
    const drive = Math.min(distance / reach, 1);
    const x = g.x - step * drive * gx + (Math.random() - 0.5) * jitter * drive * distance;
    const y = g.y - step * drive * gy + (Math.random() - 0.5) * jitter * drive * distance;
    if (inside(x, y)) {
      moved = Math.max(moved, Math.abs(x - g.x) + Math.abs(y - g.y));
      g.x = x;
      g.y = y;
    }
  }
  return moved;
};

// --- drawing -----------------------------------------------------------

const PALETTE = {
  sand: "#ffd77a",
  crest: "#d4af37",
  trough: "#4a6fd4",
  ink: "#0b0b18",
};

// the standing wave itself, drawn once per mode into an offscreen canvas
const buildField = () => {
  sampleWave();
  const n = GRID;
  if (!field) {
    field = document.createElement("canvas");
    field.width = field.height = n;
  }
  const image = field.getContext("2d").createImageData(n, n);
  let peak = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(wave.v[(j + PAD) * SPAN + i + PAD]));
  }
  const crest = [212, 175, 55];
  const trough = [74, 111, 212];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const p = (j * n + i) * 4;
      if (!inside(i / (n - 1), j / (n - 1))) {
        image.data[p + 3] = 0;
        continue;
      }
      const v = wave.v[(j + PAD) * SPAN + i + PAD];
      const t = Math.abs(v) / (peak || 1);
      const c = v >= 0 ? crest : trough;
      image.data[p] = c[0] * t;
      image.data[p + 1] = c[1] * t;
      image.data[p + 2] = c[2] * t;
      image.data[p + 3] = 255;
    }
  }
  field.getContext("2d").putImageData(image, 0, 0);
  unsettle();
};

// The grains are written straight into a pixel buffer, then laid on the
// plate in one drawImage: far cheaper than 20,000 fillRect calls through a
// clipping path.
let sandLayer = null;
let sandImage = null;
let sandPixels = null;
const SAND_PIXEL = (() => {
  const c = parseInt(PALETTE.sand.slice(1), 16);
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  // ImageData is RGBA in memory; read as a Uint32 that is ABGR on little-endian
  const little = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  return little ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0 : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
})();

const drawSand = (ctx, w) => {
  if (!sandLayer || sandLayer.width !== w) {
    sandLayer = document.createElement("canvas");
    sandLayer.width = sandLayer.height = w;
    sandImage = sandLayer.getContext("2d").createImageData(w, w);
    sandPixels = new Uint32Array(sandImage.data.buffer);
  }
  sandPixels.fill(0);
  const size = Math.max(2, Math.round(w / 450)); // a grain is about 2 px at 900 px
  const max = w - size;
  for (const g of grains) {
    let px = ((g.x + g.ox) * w - size / 2) | 0;
    let py = ((g.y + g.oy) * w - size / 2) | 0;
    if (px < 0) px = 0;
    else if (px > max) px = max;
    if (py < 0) py = 0;
    else if (py > max) py = max;
    for (let dy = 0; dy < size; dy++) {
      const row = (py + dy) * w + px;
      for (let dx = 0; dx < size; dx++) sandPixels[row + dx] = SAND_PIXEL;
    }
  }
  sandLayer.getContext("2d").putImageData(sandImage, 0, 0);
  ctx.drawImage(sandLayer, 0, 0);
};

const draw = () => {
  const canvas = $("plate");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  ctx.clearRect(0, 0, w, w);

  ctx.save();
  ctx.beginPath();
  if (state.shape === "square") ctx.rect(0, 0, w, w);
  else ctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(0, 0, w, w);

  if (state.render !== "sand" && field) {
    ctx.globalAlpha = state.render === "both" ? 0.55 : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field, 0, 0, w, w);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // every grain is already inside the plate, so the sand needs no clip
  if (state.render !== "field") drawSand(ctx, w);

  ctx.strokeStyle = "#ffffff26";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (state.shape === "square") ctx.rect(1, 1, w - 2, w - 2);
  else ctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
};

// Once nothing has visibly moved for half a second the figure is formed, and
// the loop goes to sleep until the plate, the sand, or the view changes.
const STILL = 0.0002; // well under a pixel
const STILL_FRAMES = 30;
let still = 0;

const loop = () => {
  const moved = state.render !== "field" ? shake() : 0;
  draw();
  still = moved < STILL ? still + 1 : 0;
  if (still >= STILL_FRAMES) running = false;
  if (running) requestAnimationFrame(loop);
};

const start = () => {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
};

const wake = () => {
  still = 0;
  start();
};

// --- the tone ----------------------------------------------------------

let audio = null;
let oscillator = null;
let gain = null;

const playing = () => !!oscillator;

const playTone = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!audio) audio = new Ctx();
  if (audio.state === "suspended") audio.resume();
  if (oscillator) return;
  oscillator = audio.createOscillator();
  gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = state.mode.frequency;
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, audio.currentTime + 0.15);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start();
  $("play").textContent = "Stop";
};

const stopTone = () => {
  if (!oscillator) return;
  gain.gain.cancelScheduledValues(audio.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.12);
  oscillator.stop(audio.currentTime + 0.15);
  oscillator = null;
  $("play").textContent = "Play";
};

const toggleTone = () => (playing() ? stopTone() : playTone());

// A ramp runs from the previous scheduled event, which may be the moment the
// oscillator started. Pinning the current pitch first makes every glide start
// from what is actually sounding, however fast the slider moves.
const retune = () => {
  if (!oscillator) return;
  const pitch = oscillator.frequency;
  const now = audio.currentTime;
  pitch.cancelScheduledValues(now);
  pitch.setValueAtTime(pitch.value, now);
  pitch.linearRampToValueAtTime(state.mode.frequency, now + 0.08);
};

// --- wiring ------------------------------------------------------------

const fFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// The slider is linear in octaves, the way a frequency sweep is heard. It
// spans the plate's own spectrum, from just below its lowest mode to just
// above its highest, so every mode can be reached by dragging; the range
// follows the plate as its shape and size change.
let low = 40;
let high = 4000;
const toSlider = (f) => (Math.log(f / low) / Math.log(high / low)) * 1000;
const fromSlider = (v) => low * Math.pow(high / low, v / 1000);

const fitRange = () => {
  low = state.modes[0].frequency / 1.05;
  high = state.modes[state.modes.length - 1].frequency * 1.05;
  state.frequency = Math.min(Math.max(state.frequency, low), high);
  $("freq").value = toSlider(state.frequency);
};

const modeLabel = () =>
  state.shape === "square"
    ? `Chladni plate <b>${state.mode.name}</b>`
    : `Drumhead <b>${state.mode.name}</b>`;

const shapeBlurb = () =>
  state.shape === "square"
    ? "A square steel plate 1 mm thick, free at its edges. Two modes of the same frequency cancel each other, and the sand settles along the lines where the cancellation is exact."
    : "A circular membrane fixed at its rim, like a drumhead. Each mode has a number of nodal diameters and a number of nodal circles, set by the zeros of a Bessel function.";

const refreshPanel = () => {
  $("pname").innerHTML = modeLabel();
  $("tagline").textContent = `resonates at ${fFormat.format(
    state.mode.frequency
  )} Hz`;
  $("blurb").textContent = shapeBlurb();
  $("freqVal").textContent = fFormat.format(state.frequency) + " Hz";
  $("sizeVal").textContent = Math.round(state.size * 100) + " cm";
  $("mixVal").textContent = state.mix.toFixed(2);
  $("grainsVal").textContent = fFormat.format(state.grains);
  $("mixRow").style.display = state.shape === "square" ? "" : "none";
  $("modeName").textContent = state.mode.name;
};

// picking a frequency picks the mode that actually resonates there
const settle = (rebuildGrains) => {
  state.modes = spectrum(state.shape, state.size);
  fitRange();
  state.mode = nearestMode(state.modes, state.frequency);
  buildField();
  if (rebuildGrains) scatter();
  refreshPanel();
  retune();
  draw();
};

const onFrequency = (input) => {
  state.frequency = fromSlider(+input.value);
  settle(false);
};

const onSize = (input) => {
  state.size = +input.value / 100;
  settle(false);
};

const onMix = (input) => {
  state.mix = +input.value;
  buildField();
  refreshPanel();
  draw();
};

const onGrains = (input) => {
  state.grains = +input.value;
  scatter();
  refreshPanel();
};

const onShape = (select) => {
  state.shape = select.value;
  settle(true);
};

const onRender = (select) => {
  state.render = select.value;
  draw();
  wake();
};

const onStep = (direction) => {
  const i = state.modes.indexOf(state.mode);
  const next = state.modes[Math.min(Math.max(i + direction, 0), state.modes.length - 1)];
  state.frequency = next.frequency;
  settle(false);
};

const savePNG = () => {
  const link = document.createElement("a");
  link.download = `cymatics-${state.shape}-${state.mode.name.replace(", ", "-")}.png`;
  link.href = $("plate").toDataURL("image/png");
  link.click();
};

const resize = () => {
  const canvas = $("plate");
  const box = canvas.parentElement.getBoundingClientRect();
  const side = Math.round(Math.min(box.width, 760) * (window.devicePixelRatio || 1));
  canvas.width = canvas.height = Math.max(side, 200);
  draw();
};

const init = () => {
  const params = new URLSearchParams(location.search);
  if (params.get("shape") === "circle") state.shape = "circle";
  state.modes = spectrum(state.shape, state.size);
  const wanted = params.get("mode");
  const picked = wanted && state.modes.find((m) => m.name === wanted);
  state.frequency = picked ? picked.frequency : state.frequency;

  $("shape").value = state.shape;
  $("size").value = state.size * 100;
  $("mix").value = state.mix;
  $("grains").value = state.grains;
  $("render").value = state.render;

  scatter();
  settle(false);
  resize();
  window.addEventListener("resize", resize);
  start();
};
