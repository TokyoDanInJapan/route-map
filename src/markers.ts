// Where a marker is drawn, as opposed to where the place it stands for is.
//
// Both jobs here are presentation rather than data: route.json keeps the true
// coordinates, and moving a marker so it can be seen is a decision about how to
// draw it. Kept DOM-free, so both are unit-tested.

import type { Point } from './types.js';

/**
 * Two markers whose centres are closer than this overlap, since a numbered
 * marker is a 13-unit disc with a 2-unit ring.
 */
export const COLLIDE_PX = 30;

/** How far a fanned-out cluster spreads, at minimum. */
export const MIN_NUDGE = 18;

/** Below this a marker still covers its own spot, so a leader would be noise. */
export const LEADER_MIN_PX = 6;

/**
 * Photo dots are 4 units across against a numbered marker's 13, and a gallery
 * brings a hundred and fifty of them rather than a dozen, so they get their own
 * spacing. Fanning them at the marker radius would turn a busy stretch of road
 * into a starburst covering half the map.
 */
export const PHOTO_COLLIDE_PX = 13;
export const PHOTO_NUDGE = 9;

/** Photographs closer together than this become one dot carrying a count. */
export const GROUP_PX = 10;

export interface Placed<T> {
  item: T;
  /** Where the marker is drawn. */
  mx: number;
  my: number;
  /** Set when the marker had to be moved off its true position. */
  leader: boolean;
}

/**
 * Move overlapping markers apart, keeping a line back to where they belong.
 *
 * Places geocode to the same spot more often than you would think - an onsen
 * inside a campsite, a castle beside the station named after it - and a marker
 * hidden underneath another may as well not be drawn. Fanning a cluster around
 * its centroid shows all of them. The leader line and the dot left behind are
 * what stop that being a lie about where the place is.
 *
 * Generic over anything with an x and a y, because the photo dots need exactly
 * this at a different size. Two copies of it would drift apart.
 */
export function placeMarkers<T extends Point>(
  items: readonly T[],
  width: number,
  height: number,
  collide = COLLIDE_PX,
  minNudge = MIN_NUDGE,
  edge = 15
): Placed<T>[] {
  // Group anything within touching distance, following chains: three places in
  // a row, each near the next, are one cluster rather than two overlapping
  // pairs.
  const cluster = new Array(items.length).fill(-1);
  let groups = 0;
  for (let i = 0; i < items.length; i++) {
    if (cluster[i] >= 0) continue;
    cluster[i] = groups;
    const queue = [i];
    while (queue.length) {
      const a = queue.pop()!;
      for (let b = 0; b < items.length; b++) {
        if (cluster[b] >= 0) continue;
        if (Math.hypot(items[a].x - items[b].x, items[a].y - items[b].y) < collide) {
          cluster[b] = groups;
          queue.push(b);
        }
      }
    }
    groups++;
  }

  const placed: Placed<T>[] = items.map((item) => ({ item, mx: item.x, my: item.y, leader: false }));

  for (let g = 0; g < groups; g++) {
    const members = placed.filter((_, i) => cluster[i] === g);
    if (members.length < 2) continue;

    const cx = members.reduce((sum, m) => sum + m.item.x, 0) / members.length;
    const cy = members.reduce((sum, m) => sum + m.item.y, 0) / members.length;
    // Spread far enough that neighbours on the ring clear each other.
    const radius = Math.max(minNudge, (collide / 2 + 1) / Math.sin(Math.PI / members.length));

    members.forEach((m, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / members.length;
      // Keep the marker on the image even when the cluster sits near an edge.
      m.mx = Math.min(width - edge, Math.max(edge, cx + radius * Math.cos(angle)));
      m.my = Math.min(height - 15, Math.max(edge, cy + radius * Math.sin(angle)));
    });
  }

  // Fanning a cluster can push one of its markers into a neighbouring
  // cluster's, and clamping at the image edge can do the same, so settle any
  // pair still touching by pushing both along the line between them. A handful
  // of passes is plenty for the dozen-or-so markers a write-up has.
  for (let pass = 0; pass < 12; pass++) {
    let settled = true;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        let dx = placed[j].mx - placed[i].mx;
        let dy = placed[j].my - placed[i].my;
        let gap = Math.hypot(dx, dy);
        if (gap >= collide) continue;
        settled = false;
        if (gap < 0.001) {
          // Exactly coincident leaves no direction to separate along.
          dx = 1;
          dy = 0;
          gap = 1;
        }
        const push = (collide - gap) / 2 + 0.5;
        const ux = (dx / gap) * push;
        const uy = (dy / gap) * push;
        placed[i].mx = Math.min(width - edge, Math.max(edge, placed[i].mx - ux));
        placed[i].my = Math.min(height - 15, Math.max(edge, placed[i].my - uy));
        placed[j].mx = Math.min(width - edge, Math.max(edge, placed[j].mx + ux));
        placed[j].my = Math.min(height - 15, Math.max(edge, placed[j].my + uy));
      }
    }
    if (settled) break;
  }

  // A marker shifted only a unit or two still covers the spot it belongs to, so
  // a line to it would be a smudge rather than information.
  for (const m of placed) {
    m.leader = Math.hypot(m.mx - m.item.x, m.my - m.item.y) > LEADER_MIN_PX;
  }

  return placed;
}

export interface Group<T> extends Point {
  km: number;
  members: T[];
}

/**
 * Merge photographs taken in the same place into one dot.
 *
 * Fanning is the right answer for a handful of markers that happen to coincide,
 * and the wrong one here. A rest stop produces a dozen photographs at an
 * identical distance along the route, and thirteen dots fanned around one point
 * with a leader line each is a sunburst sitting on the map, not a set of
 * markers. The first version of this drew exactly that.
 *
 * So coincident photographs are merged first, and the spreading only ever
 * handles markers that are genuinely near but distinct - which is the job it is
 * good at. The dot carries a count, so a group never pretends to be one
 * photograph.
 */
export function groupPhotos<T extends Point & { km: number }>(pins: readonly T[], within = GROUP_PX): Group<T>[] {
  const groups: Group<T>[] = [];
  for (const pin of pins) {
    const near = groups.find((g) => Math.hypot(g.x - pin.x, g.y - pin.y) <= within);
    if (near) {
      near.members.push(pin);
      // Keep the dot on the group's centre of mass rather than on whichever
      // photograph happened to arrive first.
      near.x = near.members.reduce((sum, m) => sum + m.x, 0) / near.members.length;
      near.y = near.members.reduce((sum, m) => sum + m.y, 0) / near.members.length;
    } else {
      groups.push({ x: pin.x, y: pin.y, km: pin.km, members: [pin] });
    }
  }
  return groups;
}
