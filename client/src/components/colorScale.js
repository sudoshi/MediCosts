import { rgb } from 'd3-color';

// Refined heat scale for neutral dark backgrounds
// Indigo → blue → cyan → emerald → amber → rose
const STOPS = [
  [ 49,  46,  129],  // deep indigo (low)
  [ 59, 130,  246],  // blue
  [ 34, 211,  238],  // cyan
  [ 52, 211,  153],  // emerald
  [251, 191,   36],  // amber
  [244,  63,   94],  // rose (high)
];

export function interpolateReimbursement(t) {
  return interpolateYlOrRd(1 - t);
}

export function interpolateYlOrRd(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (STOPS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, STOPS.length - 1);
  const f = idx - lo;

  const r = Math.round(STOPS[lo][0] + f * (STOPS[hi][0] - STOPS[lo][0]));
  const g = Math.round(STOPS[lo][1] + f * (STOPS[hi][1] - STOPS[lo][1]));
  const b = Math.round(STOPS[lo][2] + f * (STOPS[hi][2] - STOPS[lo][2]));

  return rgb(r, g, b).formatHex();
}
