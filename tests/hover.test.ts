import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  chartXOfKm,
  chartYOfEle,
  kmAtChartX,
  nearestPoint,
  pointAtKm,
} from '../src/hover.js';
import type { HoverRow, PlotGeometry } from '../src/types.js';

const plot: PlotGeometry = {
  w: 1024,
  h: 350,
  padL: 42,
  plotW: 970,
  padT: 28,
  plotH: 294,
  kmMin: 0,
  kmMax: 100,
  yLo: 0,
  yHi: 1000,
};

// Two segments: 0-2 km, then a teleport to somewhere else for 2-3 km.
const rows: HoverRow[] = [
  [0, 100, 10, 10, 0],
  [1, 200, 20, 10, 0],
  [2, 300, 30, 10, 0],
  [2.5, 400, 500, 500, 1],
  [3, 500, 510, 500, 1],
];

describe('chart axis mapping', () => {
  it('puts the ends of the ride at the ends of the plot area', () => {
    expect(chartXOfKm(0, plot)).toBe(42);
    expect(chartXOfKm(100, plot)).toBe(1012);
  });

  it('puts the top of the elevation range at the top of the plot area', () => {
    expect(chartYOfEle(1000, plot)).toBe(28);
    expect(chartYOfEle(0, plot)).toBe(322);
  });

  it('round-trips distance through x', () => {
    for (const km of [0, 12.5, 33.3, 99.9, 100]) {
      expect(kmAtChartX(chartXOfKm(km, plot), plot)).toBeCloseTo(km, 9);
    }
  });

  it('clamps a pointer that strays into the axis padding', () => {
    expect(kmAtChartX(0, plot)).toBe(0);
    expect(kmAtChartX(-500, plot)).toBe(0);
    expect(kmAtChartX(1024, plot)).toBe(100);
  });

  it('degenerates safely when a plot has no width or no elevation range', () => {
    const flat = { ...plot, plotW: 0, yHi: 0 };
    expect(kmAtChartX(500, flat)).toBe(flat.kmMin);
    expect(chartXOfKm(50, { ...plot, kmMax: 0 })).toBe(42);
    expect(chartYOfEle(0, flat)).toBe(28);
  });
});

describe('pointAtKm', () => {
  it('returns the sample itself at an exact distance', () => {
    expect(pointAtKm(rows, 1)).toEqual({ km: 1, ele: 200, x: 20, y: 10 });
  });

  it('interpolates between samples', () => {
    expect(pointAtKm(rows, 1.5)).toEqual({ km: 1.5, ele: 250, x: 25, y: 10 });
  });

  it('holds at the ends rather than running off the track', () => {
    expect(pointAtKm(rows, -5)).toEqual({ km: 0, ele: 100, x: 10, y: 10 });
    expect(pointAtKm(rows, 99)).toEqual({ km: 3, ele: 500, x: 510, y: 500 });
  });

  it('snaps to the nearer side of a teleport instead of crossing the gap', () => {
    // 2.0 km ends segment 0 at x=30; 2.5 km resumes segment 1 at x=500.
    // Anything in between must land on one end or the other, never halfway.
    expect(pointAtKm(rows, 2.1)).toEqual({ km: 2, ele: 300, x: 30, y: 10 });
    expect(pointAtKm(rows, 2.4)).toEqual({ km: 2.5, ele: 400, x: 500, y: 500 });
  });

  it('has nothing to say about an empty track', () => {
    expect(pointAtKm([], 1)).toBeNull();
  });
});

describe('nearestPoint', () => {
  it('finds the closest sample to a map pixel', () => {
    expect(nearestPoint(rows, 21, 12)).toEqual({ km: 1, ele: 200, x: 20, y: 10 });
    expect(nearestPoint(rows, 505, 499)).toEqual({ km: 2.5, ele: 400, x: 500, y: 500 });
  });

  it('still answers for a pointer nowhere near the route', () => {
    expect(nearestPoint(rows, -1000, -1000)).toEqual({ km: 0, ele: 100, x: 10, y: 10 });
  });

  it('has nothing to say about an empty track', () => {
    expect(nearestPoint([], 0, 0)).toBeNull();
  });
});

describe('against a real generated route.json', () => {
  // A committed fixture rather than a synthesised one. Everything above tests
  // the maths against numbers chosen to make it checkable; this tests it
  // against a file gpx-mapgen actually wrote, which is the shape that has to
  // keep working.
  const route = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures/route.json'), 'utf8')
  ) as {
    map: { w: number; h: number };
    plot: PlotGeometry;
    hover: HoverRow[];
    route: { c: string; pts: number[][] }[];
  };

  it('covers the whole ride, ascending in distance', () => {
    expect(route.hover.length).toBeGreaterThan(100);
    expect(route.hover[0][0]).toBe(0);
    expect(route.hover[route.hover.length - 1][0]).toBeCloseTo(route.plot.kmMax, 1);
    for (let i = 1; i < route.hover.length; i++) {
      expect(route.hover[i][0]).toBeGreaterThanOrEqual(route.hover[i - 1][0]);
    }
  });

  it('keeps every sample inside the map image', () => {
    for (const [, , x, y] of route.hover) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(route.map.w);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(route.map.h);
    }
  });

  it('keeps every elevation inside the axis range the chart drew', () => {
    for (const [, ele] of route.hover) {
      expect(ele).toBeGreaterThanOrEqual(route.plot.yLo);
      expect(ele).toBeLessThanOrEqual(route.plot.yHi);
    }
  });

  it('resolves a hover anywhere along the ride to a point on the map', () => {
    for (let i = 0; i <= 20; i++) {
      const km = (route.plot.kmMax * i) / 20;
      const point = pointAtKm(route.hover, km);
      expect(point).not.toBeNull();
      expect(point!.x).toBeGreaterThanOrEqual(0);
      expect(point!.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('round-trips: a map pixel on the route resolves back to the same place', () => {
    // Take a hover sample, ask what is nearest to it, and expect itself.
    for (let i = 0; i < route.hover.length; i += 37) {
      const [km, , x, y] = route.hover[i];
      const found = nearestPoint(route.hover, x, y);
      expect(found!.km).toBeCloseTo(km, 3);
    }
  });

  it("draws every run in one of the profile's gradient-band colours", () => {
    const bands = new Set(['#2ca02c', '#ffd11a', '#ff8c00', '#e60000', '#8b0000']);
    expect(route.route.length).toBeGreaterThan(0);
    for (const run of route.route) {
      expect(bands.has(run.c)).toBe(true);
      expect(run.pts.length).toBeGreaterThanOrEqual(2);
    }
  });
});
