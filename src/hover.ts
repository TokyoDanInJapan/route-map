// The maths behind the synced cursor: move the pointer over the route map or
// the elevation profile, and both graphics mark the same spot.
//
// Distance along the ride is the shared axis. The map knows where each
// kilometre sits in image pixels, the chart knows where it sits on its own
// axes, and every lookup here is a conversion between the two through a km.
//
// The numbers come from route.json, written by `gpx-mapgen --overlay`. Kept
// DOM-free so it can be unit-tested. The wiring lives in client.ts.

import type { HoverRow, PlotGeometry, TrackPoint } from './types.js';

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Distance -> x in the chart's viewBox units. Mirrors x_of() in gpx_mapgen.py. */
export function chartXOfKm(km: number, plot: PlotGeometry): number {
  const span = plot.kmMax - plot.kmMin;
  if (span <= 0) return plot.padL;
  return plot.padL + ((km - plot.kmMin) / span) * plot.plotW;
}

/** Elevation -> y in the chart's viewBox units. Mirrors y_of() in gpx_mapgen.py. */
export function chartYOfEle(ele: number, plot: PlotGeometry): number {
  const span = plot.yHi - plot.yLo;
  if (span <= 0) return plot.padT;
  return plot.padT + (1 - (ele - plot.yLo) / span) * plot.plotH;
}

/**
 * x in the chart's viewBox units -> distance, clamped to the ride.
 *
 * Clamping rather than rejecting: the pointer regularly strays into the axis
 * padding, and pinning the cursor to the first or last kilometre reads better
 * than having it blink out at the edges.
 */
export function kmAtChartX(x: number, plot: PlotGeometry): number {
  if (plot.plotW <= 0) return plot.kmMin;
  const km = plot.kmMin + ((x - plot.padL) / plot.plotW) * (plot.kmMax - plot.kmMin);
  return clamp(km, plot.kmMin, plot.kmMax);
}

/**
 * The position at a given distance, interpolated between samples.
 *
 * Rows are ascending in km, so this binary-searches rather than scanning.
 * Across a teleport gap the two bracketing samples belong to different
 * segments; interpolating there would drag the marker through country the
 * rider never crossed, so it snaps to the nearer sample instead.
 */
export function pointAtKm(rows: readonly HoverRow[], km: number): TrackPoint | null {
  if (rows.length === 0) return null;

  // Hold at the ends. Callers clamp to the chart's axis, but the table can
  // stop fractionally short of it, and a reported distance that runs past
  // either end of the ride would be a lie however small.
  const target = clamp(km, rows[0][0], rows[rows.length - 1][0]);

  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rows[mid][0] <= target) lo = mid;
    else hi = mid - 1;
  }

  const a = rows[lo];
  const b = rows[lo + 1];
  if (!b) return { km: a[0], ele: a[1], x: a[2], y: a[3] };

  if (a[4] !== b[4]) {
    const nearer = target - a[0] <= b[0] - target ? a : b;
    return { km: nearer[0], ele: nearer[1], x: nearer[2], y: nearer[3] };
  }

  const span = b[0] - a[0];
  const t = span > 0 ? clamp((target - a[0]) / span, 0, 1) : 0;
  return {
    km: target,
    ele: a[1] + (b[1] - a[1]) * t,
    x: a[2] + (b[2] - a[2]) * t,
    y: a[3] + (b[3] - a[3]) * t,
  };
}

/**
 * The sample nearest a point in map image pixels.
 *
 * A plain scan: the table is one row per 100 m, so even a long tour is a few
 * thousand rows and this runs comfortably inside a pointermove. Snapping to a
 * sample rather than projecting onto the line between two keeps the marker on
 * the drawn route, and 100 m is a few pixels at the zooms these maps use.
 */
export function nearestPoint(rows: readonly HoverRow[], x: number, y: number): TrackPoint | null {
  let best: HoverRow | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    const dx = row[2] - x;
    const dy = row[3] - y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }
  return best ? { km: best[0], ele: best[1], x: best[2], y: best[3] } : null;
}

/**
 * Thin the hover table to about one sample per unit of the chart's x axis.
 *
 * route.json samples every 100 m, which for a 300 km tour is 6,000 rows - six
 * per chart unit, and the single heaviest thing on the page. The cursor can
 * only ever be placed to the nearest unit, and a unit is already sub-pixel at
 * the size these charts render, so the rest is bytes nobody can see.
 *
 * Segment boundaries survive thinning whatever the spacing says. They are what
 * stops a hover interpolating across a teleport gap.
 */
export function thinHover(rows: readonly HoverRow[], plot: PlotGeometry): HoverRow[] {
  if (rows.length < 3 || plot.plotW <= 0) return [...rows];
  const minStepKm = (plot.kmMax - plot.kmMin) / plot.plotW;
  if (minStepKm <= 0) return [...rows];

  const kept: HoverRow[] = [];
  let lastKm = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const boundary =
      i === 0 || i === rows.length - 1 || rows[i][4] !== rows[i - 1][4] || rows[i][4] !== rows[i + 1][4];
    if (boundary || rows[i][0] - lastKm >= minStepKm) {
      kept.push(rows[i]);
      lastKm = rows[i][0];
    }
  }
  return kept;
}
