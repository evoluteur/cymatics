/*!
 * Cymatics - the plate mathematics
 * https://github.com/evoluteur/cymatics
 * (c) 2026 Olivier Giulieri - MIT license
 *
 * Everything here is computed from the wave equation alone: the Bessel
 * functions come from their own series, their zeros from a scan and a
 * bisection, and the frequencies from the thin-plate and membrane laws.
 * No tables, no libraries.
 */

// --- Bessel functions of the first kind --------------------------------
// J_n(x) = SUM (-1)^k / (k! (k+n)!) (x/2)^(2k+n)

const factorial = (n) => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
};

const besselJ = (n, x) => {
  const half = x / 2;
  let term = Math.pow(half, n) / factorial(n);
  let sum = 0;
  for (let k = 0; k < 90; k++) {
    sum += term;
    term *= -(half * half) / ((k + 1) * (k + 1 + n));
    if (Math.abs(term) < 1e-18 * (Math.abs(sum) + 1e-12)) break;
  }
  return sum;
};

// the positive zeros of J_n, found by scanning for sign changes
const besselZeros = (n, count) => {
  const zeros = [];
  const step = 0.05;
  let x = n === 0 ? 0.5 : n; // J_n(0) = 0 for n > 0 and is not a mode
  let previous = besselJ(n, x);
  while (zeros.length < count && x < 400) {
    const next = x + step;
    const value = besselJ(n, next);
    if (previous * value < 0) {
      let lo = x;
      let hi = next;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (besselJ(n, lo) * besselJ(n, mid) <= 0) hi = mid;
        else lo = mid;
      }
      zeros.push((lo + hi) / 2);
    }
    x = next;
    previous = value;
  }
  return zeros;
};

// zeros are reused on every frame, so they are computed once
const ZEROS = [];
const zeroOf = (n, s) => {
  if (!ZEROS[n]) ZEROS[n] = besselZeros(n, 9);
  return ZEROS[n][s - 1];
};

// --- the plates --------------------------------------------------------

// A steel plate 1 mm thick, and a drumhead under the tension of a tom.
const PLATE = {
  young: 200e9, // Pa, steel
  density: 7850, // kg/m3
  poisson: 0.3,
  thickness: 0.001, // m
};
const MEMBRANE = {
  speed: 100, // m/s, wave speed of the stretched skin
};

// thin-plate flexural rigidity: D = E h^3 / (12 (1 - v^2))
const rigidity = () =>
  (PLATE.young * Math.pow(PLATE.thickness, 3)) /
  (12 * (1 - PLATE.poisson * PLATE.poisson));

// A square plate is stiff: its frequencies grow with the SQUARE of the
// wavenumber, f = lambda^2 / 2pi * sqrt(D / rho h), lambda^2 = pi^2 (m^2+n^2) / L^2
const squareFrequency = (m, n, side) =>
  ((Math.PI * (m * m + n * n)) / (2 * side * side)) *
  Math.sqrt(rigidity() / (PLATE.density * PLATE.thickness));

// A drumhead has no stiffness, only tension: frequencies grow with the
// wavenumber itself, f = c * alpha / (2 pi a)
const circleFrequency = (n, s, radius) =>
  (MEMBRANE.speed * zeroOf(n, s)) / (2 * Math.PI * radius);

// --- mode shapes -------------------------------------------------------

// Chladni's square plate with free edges. The classic figures are the
// zero set of cos(n pi x) cos(m pi y) - cos(m pi x) cos(n pi y): two
// degenerate modes cancelling each other. "mix" sweeps that cancellation.
const squareAmplitude = (m, n, mix, x, y) => {
  const a = Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y);
  if (m === n) return a; // not degenerate, nothing to superpose
  const b = Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
  return a + mix * b;
};

// A circular membrane: n nodal diameters and s nodal circles.
const circleAmplitude = (n, s, x, y) => {
  const dx = x * 2 - 1;
  const dy = y * 2 - 1;
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r > 1) return NaN; // outside the drum
  return besselJ(n, zeroOf(n, s) * r) * Math.cos(n * Math.atan2(dy, dx));
};

// --- the spectrum ------------------------------------------------------

// Every mode of the chosen plate, sorted by frequency, so that sweeping a
// frequency can land on the mode that actually resonates there.
const spectrum = (shape, size) => {
  const modes = [];
  if (shape === "square") {
    for (let m = 0; m <= 9; m++) {
      for (let n = m; n <= 9; n++) {
        if (m + n === 0) continue; // the flat plate is not a mode
        modes.push({
          m,
          n,
          name: `${m}, ${n}`,
          frequency: squareFrequency(m, n, size),
        });
      }
    }
  } else {
    for (let n = 0; n <= 7; n++) {
      for (let s = 1; s <= 5; s++) {
        modes.push({
          m: n,
          n: s,
          name: `${n}, ${s}`,
          frequency: circleFrequency(n, s, size / 2),
        });
      }
    }
  }
  return modes.sort((a, b) => a.frequency - b.frequency);
};

const nearestMode = (modes, frequency) =>
  modes.reduce((best, mode) =>
    Math.abs(Math.log(mode.frequency / frequency)) <
    Math.abs(Math.log(best.frequency / frequency))
      ? mode
      : best
  );

// the amplitude of the current mode at (x, y), both in [0, 1]
const amplitudeAt = (state, x, y) =>
  state.shape === "square"
    ? squareAmplitude(state.mode.m, state.mode.n, state.mix, x, y)
    : circleAmplitude(state.mode.m, state.mode.n, x, y);

if (typeof module !== "undefined") {
  module.exports = {
    besselJ,
    besselZeros,
    zeroOf,
    squareFrequency,
    circleFrequency,
    squareAmplitude,
    circleAmplitude,
    spectrum,
    nearestMode,
    amplitudeAt,
  };
}
