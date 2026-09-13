/*!
 * Cymatics - the gallery of modes
 * https://github.com/evoluteur/cymatics
 * (c) 2026 Olivier Giulieri - MIT license
 */

const $ = (id) => document.getElementById(id);

const SIZE = 0.3; // the 30 cm plate the frequencies below refer to

const SQUARE_MODES = [
  [0, 1], [1, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3],
  [3, 3], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [2, 5], [3, 5],
  [4, 5], [1, 6], [3, 6], [5, 6],
];

const CIRCLE_MODES = [
  [0, 1], [1, 1], [2, 1], [0, 2], [3, 1], [1, 2], [4, 1], [2, 2],
  [0, 3], [5, 1], [3, 2], [1, 3], [6, 1], [4, 2], [2, 3], [0, 4],
];

// A nodal line is where the amplitude crosses zero. Dividing the amplitude
// by its own slope turns "small value" into "close to the line", which
// keeps every line the same width however steep the wave is there.
const drawNodes = (canvas, shape, m, n, mix) => {
  const w = canvas.width;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(w, w);
  const state = { shape, mix, mode: { m, n } };
  const h = 1 / w;
  const width = 2.2 / w;
  const sand = [255, 215, 122];
  for (let j = 0; j < w; j++) {
    for (let i = 0; i < w; i++) {
      const x = i / (w - 1);
      const y = j / (w - 1);
      const p = (j * w + i) * 4;
      const z = amplitudeAt(state, x, y);
      if (isNaN(z)) {
        image.data[p + 3] = 0;
        continue;
      }
      const gx = (amplitudeAt(state, x + h, y) - amplitudeAt(state, x - h, y)) / (2 * h);
      const gy = (amplitudeAt(state, x, y + h) - amplitudeAt(state, x, y - h)) / (2 * h);
      const distance = Math.abs(z) / (Math.hypot(gx, gy) + 1e-9);
      const t = Math.max(0, 1 - distance / width);
      image.data[p] = 11 + (sand[0] - 11) * t;
      image.data[p + 1] = 11 + (sand[1] - 11) * t;
      image.data[p + 2] = 24 + (sand[2] - 24) * t;
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
};

const fFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

const tile = (shape, m, n, frequency) => {
  const name = `${m}, ${n}`;
  const link = document.createElement("a");
  link.className = "tile";
  link.href = `index.html?shape=${shape}&mode=${encodeURIComponent(name)}`;
  link.title = `${name} - ${fFormat.format(frequency)} Hz`;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 200;
  link.appendChild(canvas);
  const caption = document.createElement("div");
  caption.className = "cap";
  caption.innerHTML = `<b>${name}</b><span>${fFormat.format(frequency)} Hz</span>`;
  link.appendChild(caption);
  drawNodes(canvas, shape, m, n, -1);
  return link;
};

// shown in the order a frequency sweep would meet them
const byFrequency = (modes, frequency) =>
  modes
    .map(([a, b]) => ({ a, b, frequency: frequency(a, b) }))
    .sort((x, y) => x.frequency - y.frequency);

const setupModesPage = () => {
  // Drawing every tile is synchronous and blocks the main thread, so the
  // spinner needs a frame to actually paint before that work starts.
  requestAnimationFrame(() => {
    const squares = $("squares");
    byFrequency(SQUARE_MODES, (m, n) => squareFrequency(m, n, SIZE)).forEach((mode) =>
      squares.appendChild(tile("square", mode.a, mode.b, mode.frequency))
    );
    const circles = $("circles");
    byFrequency(CIRCLE_MODES, (n, s) => circleFrequency(n, s, SIZE / 2)).forEach((mode) =>
      circles.appendChild(tile("circle", mode.a, mode.b, mode.frequency))
    );
    $("loading").hidden = true;
    $("gallery").hidden = false;
  });
};
