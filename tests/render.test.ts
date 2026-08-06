import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { POI_STYLES, renderRouteMap } from '../src/render.js';
import type { PhotoPin, RouteData } from '../src/types.js';

const route = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/route.json'), 'utf8')) as RouteData;
const placements = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/photos.json'), 'utf8')) as {
  photos: { x?: number; y?: number; km: number; i: number }[];
};

const photos: PhotoPin[] = placements.photos
  .filter((p) => p.x !== undefined)
  .map((p) => ({ x: p.x!, y: p.y!, km: p.km, index: p.i, thumb: `/thumbs/${p.i}.webp`, alt: `Photo ${p.i + 1}` }));

/** How many times a substring occurs. */
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('the overlay', () => {
  const { overlay } = renderRouteMap({ route });

  it('takes the map image’s own pixels as its coordinate system', () => {
    expect(overlay).toContain(`viewBox="0 0 ${route.map.w} ${route.map.h}"`);
  });

  it('is hidden from a screen reader, which has the legend instead', () => {
    expect(overlay).toContain('aria-hidden="true"');
  });

  it('draws the route three times over: outline, casing, then colour', () => {
    // Three complete passes rather than three strokes per run, so one run's
    // casing cannot overdraw its neighbour's colour at a band joint.
    expect(count(overlay, '<polyline')).toBe(route.route.length * 3);
    expect(count(overlay, 'stroke="#1f2937"')).toBe(1);
    expect(count(overlay, 'stroke="#fff" stroke-width="7"')).toBe(1);
  });

  it('marks exactly one pass as the geometry, for the preview to read back', () => {
    expect(count(overlay, 'class="route-line"')).toBe(1);
  });

  it('colours each run by its gradient band', () => {
    for (const run of route.route) expect(overlay).toContain(`stroke="${run.c}"`);
  });

  it('draws a marker for every place, in the category’s colour', () => {
    expect(count(overlay, 'class="route-poi"')).toBe(route.pois!.length);
    for (const poi of route.pois!) expect(overlay).toContain(POI_STYLES[poi.category].fill);
  });

  it('names each marker, so a pointer says which place it is', () => {
    for (const poi of route.pois!) expect(overlay).toContain(`<title>${poi.name}</title>`);
  });

  it('keeps the place markers out of the tab order', () => {
    // The legend already offers every one of these links, in reading order.
    expect(count(overlay, 'tabindex="-1"')).toBe(route.pois!.filter((p) => p.url).length);
  });
});

describe('the photographs', () => {
  it('draws a dot per placed photograph', () => {
    const { overlay, photoCount } = renderRouteMap({ route, photos });
    expect(photoCount).toBe(photos.length);
    expect(count(overlay, 'class="route-photo"')).toBe(photos.length);
    for (const photo of photos) expect(overlay).toContain(`data-thumb="${photo.thumb}"`);
  });

  it('merges photographs taken in the same place into one counted dot', () => {
    const stop: PhotoPin[] = Array.from({ length: 5 }, (_, i) => ({
      x: 300,
      y: 200,
      km: 10,
      index: i,
      thumb: `/t${i}.webp`,
      alt: `Photo ${i + 1}`,
    }));
    const { overlay, photoCount } = renderRouteMap({ route, photos: stop });
    expect(photoCount).toBe(1);
    expect(overlay).toContain('data-count="5"');
    expect(overlay).toContain('<title>5 photos here</title>');
  });

  it('leaves out a photograph that was never placed on the map', () => {
    // photos.json records a distance for every photograph it can place, but map
    // coordinates only when a route.json existed to place them in.
    const unplaced = [{ km: 3, index: 9, thumb: '/t.webp', alt: 'Photo 10' }] as unknown as PhotoPin[];
    expect(renderRouteMap({ route, photos: unplaced }).photoCount).toBe(0);
  });

  it('emits the preview markup only when there is something to preview', () => {
    expect(renderRouteMap({ route }).preview).toBe('');
    expect(renderRouteMap({ route, photos }).preview).toContain('data-photo-preview');
  });
});

describe('the legend', () => {
  const { legend } = renderRouteMap({ route });

  it('lists every place, in the order the write-up named them', () => {
    expect(count(legend, '<li ')).toBe(route.pois!.length);
    for (const poi of route.pois!) expect(legend).toContain(poi.name);
  });

  it('links a place that has a link', () => {
    const linked = route.pois!.filter((p) => p.url);
    expect(count(legend, 'rel="noopener"')).toBe(linked.length);
  });

  it('says what kind of place each is, for a reader who cannot see the colour', () => {
    expect(legend).toContain('route-map-sr');
  });

  it('is empty when the route names no places', () => {
    expect(renderRouteMap({ route: { ...route, pois: [] } }).legend).toBe('');
  });
});

describe('the payload', () => {
  it('carries only what the cursor needs', () => {
    const data = JSON.parse(renderRouteMap({ route }).data);
    expect(Object.keys(data).sort()).toEqual(['hover', 'map', 'plot']);
  });

  it('leaves a day ride\'s table alone', () => {
    // Thinning is to one sample per unit of the chart's x axis. This ride is
    // 63.5 km across a 970-unit plot, so a unit is 65 m and the samples are
    // 113 m apart - there is nothing to drop, and dropping any would cost the
    // cursor resolution the chart can show.
    const data = JSON.parse(renderRouteMap({ route }).data);
    expect(data.hover.length).toBe(route.hover.length);
  });

  it('thins a tour, where the samples are finer than the chart', () => {
    // 300 km across a 970-unit plot is 309 m to the unit, so the same 100 m
    // samples are three to a unit and two of every three are bytes nobody can
    // see. What is left is about one per unit, which is all the cursor can be
    // placed to.
    const tour: RouteData = {
      ...route,
      plot: { ...route.plot, kmMax: 300 },
      hover: Array.from({ length: 3000 }, (_, i) => [i * 0.1, 100 + (i % 50), i % 900, i % 700, 0] as const),
    };
    const kept = JSON.parse(renderRouteMap({ route: tour }).data).hover as number[][];
    expect(kept.length).toBeLessThan(tour.hover.length / 3);
    for (let i = 2; i < kept.length - 1; i++) {
      expect(kept[i][0] - kept[i - 1][0]).toBeGreaterThanOrEqual(300 / route.plot.plotW - 1e-9);
    }
  });

  it('keeps every segment boundary, however hard it thins', () => {
    // They are what stop a hover interpolating across a teleport gap.
    const ferry: RouteData = {
      ...route,
      plot: { ...route.plot, kmMax: 300 },
      hover: Array.from(
        { length: 3000 },
        (_, i) => [i * 0.1, 100, i % 900, i % 700, i < 1500 ? 0 : 1] as const
      ),
    };
    const data = JSON.parse(renderRouteMap({ route: ferry }).data);
    const segments = new Set(data.hover.map((row: number[]) => row[4]));
    expect(segments).toEqual(new Set([0, 1]));
    // The last sample before the gap and the first after it both survive.
    const lastOfFirst = data.hover.filter((row: number[]) => row[4] === 0).pop();
    expect(lastOfFirst[0]).toBeCloseTo(149.9, 5);
  });

  it('keeps the ends of the ride', () => {
    const data = JSON.parse(renderRouteMap({ route }).data);
    expect(data.hover[0][0]).toBe(route.hover[0][0]);
    expect(data.hover[data.hover.length - 1][0]).toBe(route.hover[route.hover.length - 1][0]);
  });
});

describe('the figure’s attributes', () => {
  it('marks itself for the client to find', () => {
    expect(renderRouteMap({ route }).figureAttrs).toHaveProperty('data-route-map');
  });

  it('carries a track id only when one was given', () => {
    expect(renderRouteMap({ route }).figureAttrs['data-track-id']).toBeUndefined();
    expect(renderRouteMap({ route, trackId: 'arakawa' }).figureAttrs['data-track-id']).toBe('arakawa');
  });

  it('carries a gallery id only when there are dots to click', () => {
    expect(renderRouteMap({ route, galleryid: 'rides/arakawa' }).figureAttrs['data-galleryid']).toBeUndefined();
    expect(renderRouteMap({ route, photos, galleryid: 'rides/arakawa' }).figureAttrs['data-galleryid']).toBe(
      'rides/arakawa'
    );
  });
});

describe('untrusted text', () => {
  // Place names and captions come out of a write-up, so they are text rather
  // than markup however they are punctuated.
  const nasty: RouteData = {
    ...route,
    pois: [
      {
        name: 'Bridge <script>alert(1)</script> & "quotes"',
        category: 'poi',
        url: 'https://example.com/?a=1&b=2',
        num: 1,
        x: 100,
        y: 100,
      },
    ],
  };

  it('escapes a name in the marker title and the legend', () => {
    const { overlay, legend } = renderRouteMap({ route: nasty });
    expect(overlay).not.toContain('<script>alert(1)</script>');
    expect(overlay).toContain('&lt;script&gt;');
    expect(legend).not.toContain('<script>alert(1)</script>');
  });

  it('escapes an ampersand in a link', () => {
    const { legend } = renderRouteMap({ route: nasty });
    expect(legend).toContain('https://example.com/?a=1&amp;b=2');
  });

  it('escapes a caption in a data attribute', () => {
    const quoted: PhotoPin[] = [{ x: 200, y: 200, km: 1, index: 0, thumb: '/t.webp', alt: 'A "big" hill & a bridge' }];
    const { overlay } = renderRouteMap({ route, photos: quoted });
    expect(overlay).toContain('data-alt="A &quot;big&quot; hill &amp; a bridge"');
  });
});

describe('determinism', () => {
  it('renders the same input to the same string', () => {
    // Which is what lets a static site build this once and cache it.
    const a = renderRouteMap({ route, photos, trackId: 'arakawa' });
    const b = renderRouteMap({ route, photos, trackId: 'arakawa' });
    expect(a).toEqual(b);
  });
});
