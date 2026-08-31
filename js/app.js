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
      grains.push({ x, y, ox: (Math.random() - 0.5) * 0.006, oy: (Math.random() - 0.5) * 0.006 });
  }
};

// The distance from a grain to the nearest nodal line, and the direction
// to it. Dividing the amplitude by its own slope turns "small amplitude"
// into "close to a node", which behaves the same whether the wave is
// steep (the middle of a drumhead) or shallow (its rim).
const toNode = (x, y) => {
  const h = 0.0025;
  const at = (px, py) => Math.abs(amplitudeAt(state, px, py)) || 0;
  const gx = (at(x + h, y) - at(x - h, y)) / (2 * h);
  const gy = (at(x, y + h) - at(x, y - h)) / (2 * h);
  const length = Math.hypot(gx, gy) + 1e-9;
  return { distance: Math.min(at(x, y) / length, 1), gx: gx / length, gy: gy / length };
};

// One step of the real story: a grain is thrown around where the plate
// moves and stays put where it does not, so it walks downhill to a node.
const shake = () => {
  const step = 0.006;
  const jitter = 0.10;
  const reach = 0.09; // how far a grain still feels the plate moving
  for (const g of grains) {
    const { distance, gx, gy } = toNode(g.x, g.y);
    if (distance < 0.0012) continue; // settled on a nodal line
    const drive = Math.min(distance / reach, 1);
    const x = g.x - step * drive * gx + (Math.random() - 0.5) * jitter * drive * distance;
    const y = g.y - step * drive * gy + (Math.random() - 0.5) * jitter * drive * distance;
    if (inside(x, y)) {
      g.x = x;
      g.y = y;
    }
  }
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
  const n = 260;
  field = document.createElement("canvas");
  field.width = field.height = n;
  const image = field.getContext("2d").createImageData(n, n);
  let peak = 0;
  const values = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = amplitudeAt(state, i / (n - 1), j / (n - 1));
      values[j * n + i] = v;
      if (!isNaN(v)) peak = Math.max(peak, Math.abs(v));
    }
  }
  const crest = [212, 175, 55];
  const trough = [74, 111, 212];
  for (let k = 0; k < n * n; k++) {
    const v = values[k];
    const p = k * 4;
    if (isNaN(v)) {
      image.data[p + 3] = 0;
      continue;
    }
    const t = Math.abs(v) / (peak || 1);
    const c = v >= 0 ? crest : trough;
    image.data[p] = c[0] * t;
    image.data[p + 1] = c[1] * t;
    image.data[p + 2] = c[2] * t;
    image.data[p + 3] = 255;
  }
  field.getContext("2d").putImageData(image, 0, 0);
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

  if (state.render !== "field") {
    ctx.fillStyle = PALETTE.sand;
    const r = Math.max(0.9, w / 900);
    for (const g of grains) {
      ctx.fillRect((g.x + g.ox) * w - r, (g.y + g.oy) * w - r, r * 2, r * 2);
    }
  }
  ctx.restore();

  ctx.strokeStyle = "#ffffff26";
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (state.shape === "square") ctx.rect(1, 1, w - 2, w - 2);
  else ctx.arc(w / 2, w / 2, w / 2 - 1, 0, Math.PI * 2);
  ctx.stroke();
};

const loop = () => {
  if (state.render !== "field") shake();
  draw();
  if (running) requestAnimationFrame(loop);
};

const start = () => {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
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

const retune = () => {
  if (oscillator) {
    oscillator.frequency.linearRampToValueAtTime(
      state.mode.frequency,
      audio.currentTime + 0.08
    );
  }
};

// --- wiring ------------------------------------------------------------

const fFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// the slider is linear in octaves, the way a frequency sweep is heard
const LOW = 40;
const HIGH = 4000;
const toSlider = (f) => (Math.log(f / LOW) / Math.log(HIGH / LOW)) * 1000;
const fromSlider = (v) => LOW * Math.pow(HIGH / LOW, v / 1000);

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
};

const onStep = (direction) => {
  const i = state.modes.indexOf(state.mode);
  const next = state.modes[Math.min(Math.max(i + direction, 0), state.modes.length - 1)];
  state.frequency = next.frequency;
  $("freq").value = toSlider(state.frequency);
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
  $("freq").value = toSlider(state.frequency);

  scatter();
  settle(false);
  resize();
  window.addEventListener("resize", resize);
  start();
};
