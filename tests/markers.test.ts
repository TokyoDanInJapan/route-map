import { describe, expect, it } from 'vitest';

import { COLLIDE_PX, GROUP_PX, groupPhotos, placeMarkers } from '../src/markers.js';

const W = 1024;
const H = 768;

const gap = (a: { mx: number; my: number }, b: { mx: number; my: number }) => Math.hypot(a.mx - b.mx, a.my - b.my);

describe('placeMarkers', () => {
  it('leaves a marker where it belongs when nothing is near it', () => {
    const placed = placeMarkers([{ x: 400, y: 300 }], W, H);
    expect(placed[0].mx).toBe(400);
    expect(placed[0].my).toBe(300);
    expect(placed[0].leader).toBe(false);
  });

  it('pushes two coincident markers apart', () => {
    // An onsen inside a campsite geocodes to one point, and a marker hidden
    // under another may as well not be drawn.
    const placed = placeMarkers(
      [
        { x: 500, y: 400 },
        { x: 500, y: 400 },
      ],
      W,
      H
    );
    expect(gap(placed[0], placed[1])).toBeGreaterThanOrEqual(COLLIDE_PX - 0.01);
  });

  it('separates every pair in a crowd', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ x: 500 + i, y: 400 + i }));
    const placed = placeMarkers(crowd, W, H);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(gap(placed[i], placed[j])).toBeGreaterThanOrEqual(COLLIDE_PX - 0.01);
      }
    }
  });

  it('follows a chain into one cluster rather than two overlapping pairs', () => {
    const chain = [
      { x: 500, y: 400 },
      { x: 515, y: 400 },
      { x: 530, y: 400 },
    ];
    const placed = placeMarkers(chain, W, H);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(gap(placed[i], placed[j])).toBeGreaterThanOrEqual(COLLIDE_PX - 0.01);
      }
    }
  });

  it('keeps a moved marker on the image', () => {
    const corner = [
      { x: 2, y: 2 },
      { x: 4, y: 4 },
      { x: 6, y: 6 },
    ];
    for (const m of placeMarkers(corner, W, H)) {
      expect(m.mx).toBeGreaterThanOrEqual(0);
      expect(m.my).toBeGreaterThanOrEqual(0);
      expect(m.mx).toBeLessThanOrEqual(W);
      expect(m.my).toBeLessThanOrEqual(H);
    }
  });

  it('draws a leader only for a marker that has really moved', () => {
    const [alone] = placeMarkers([{ x: 400, y: 300 }], W, H);
    expect(alone.leader).toBe(false);

    const moved = placeMarkers(
      [
        { x: 500, y: 400 },
        { x: 500, y: 400 },
      ],
      W,
      H
    );
    // Both were fanned well past the few units that would leave them still
    // covering their own spot.
    expect(moved.every((m) => m.leader)).toBe(true);
  });

  it('keeps the true position, whatever it does with the marker', () => {
    const places = [
      { x: 500, y: 400 },
      { x: 502, y: 401 },
    ];
    const placed = placeMarkers(places, W, H);
    expect(placed.map((p) => p.item)).toEqual(places);
  });

  it('takes a tighter radius for the photo dots', () => {
    const pair = [
      { x: 500, y: 400 },
      { x: 500, y: 400 },
    ];
    const wide = placeMarkers(pair, W, H);
    const tight = placeMarkers(pair, W, H, 13, 9, 6);
    expect(gap(tight[0], tight[1])).toBeLessThan(gap(wide[0], wide[1]));
  });
});

describe('groupPhotos', () => {
  it('merges photographs taken in the same place', () => {
    // A rest stop produces a dozen photographs at one spot, and fanning those
    // draws a sunburst rather than a set of markers.
    const stop = Array.from({ length: 12 }, (_, i) => ({ x: 300 + (i % 3), y: 200, km: 10 + i * 0.001 }));
    const groups = groupPhotos(stop);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(12);
  });

  it('keeps photographs from different places apart', () => {
    const groups = groupPhotos([
      { x: 100, y: 100, km: 1 },
      { x: 400, y: 300, km: 20 },
    ]);
    expect(groups).toHaveLength(2);
  });

  it('puts the dot on the group’s centre of mass', () => {
    const groups = groupPhotos([
      { x: 100, y: 100, km: 1 },
      { x: 106, y: 100, km: 1.1 },
    ]);
    expect(groups[0].x).toBe(103);
  });

  it('carries the first member’s distance, so the group sits on the route', () => {
    const groups = groupPhotos([
      { x: 100, y: 100, km: 4.2 },
      { x: 103, y: 100, km: 4.3 },
    ]);
    expect(groups[0].km).toBe(4.2);
  });

  it('groups by proximity, not by index', () => {
    const groups = groupPhotos([
      { x: 100, y: 100, km: 1 },
      { x: 900, y: 500, km: 40 },
      { x: 100 + GROUP_PX - 1, y: 100, km: 1.2 },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].members).toHaveLength(2);
  });
});
