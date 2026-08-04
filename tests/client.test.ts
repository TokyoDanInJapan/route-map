/**
 * The client half, driven through the markup the server half writes.
 *
 * happy-dom lays nothing out, so every box measures zero. Rather than pretend
 * otherwise, `getBoundingClientRect` is stubbed per figure with the geometry a
 * browser would report - which is also the only thing the cursor arithmetic
 * needs from a layout engine.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { attachRouteMap, attachRouteMaps } from '../src/client.js';
import { renderRouteMap } from '../src/render.js';
import type { PhotoPin, RouteData } from '../src/types.js';

const route = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/route.json'), 'utf8')) as RouteData;
const placements = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/photos.json'), 'utf8')) as {
  photos: { x?: number; y?: number; km: number; i: number }[];
};
const photos: PhotoPin[] = placements.photos
  .filter((p) => p.x !== undefined)
  .map((p) => ({ x: p.x!, y: p.y!, km: p.km, index: p.i, thumb: `/thumbs/${p.i}.webp`, alt: `Photo ${p.i + 1}` }));

/** The rendered size a browser would report for the frame. */
const FRAME = { left: 0, top: 0, width: route.map.w, height: route.map.h };

function build(options: Parameters<typeof renderRouteMap>[0] = { route }) {
  const markup = renderRouteMap(options);
  const figure = document.createElement('figure');
  for (const [key, value] of Object.entries(markup.figureAttrs)) figure.setAttribute(key, value);
  figure.innerHTML =
    `<div class="route-map-frame"><img alt="Map" />${markup.overlay}${markup.preview}</div>` +
    markup.legend +
    `<script type="application/json" data-route-hover>${markup.data}</script>`;
  document.body.append(figure);

  const frame = figure.querySelector<HTMLElement>('.route-map-frame')!;
  frame.getBoundingClientRect = () => ({ ...FRAME, right: FRAME.width, bottom: FRAME.height, x: 0, y: 0 }) as DOMRect;
  return { figure, frame };
}

/** A pointer event happy-dom will deliver, with the fields the client reads. */
const pointer = (type: string, x: number, y: number, pointerType = 'mouse') => {
  const event = new Event(type, { bubbles: true }) as PointerEvent & { clientX: number; clientY: number };
  Object.assign(event, { clientX: x, clientY: y, pointerType });
  return event;
};

/** An elevation chart carrying the same track id, as the site's would. */
function addChart(trackId: string) {
  const chart = document.createElement('div');
  chart.setAttribute('data-elevation-chart', trackId);
  chart.innerHTML = `<svg viewBox="0 0 ${route.plot.w} ${route.plot.h}"></svg>`;
  chart.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1024, height: 350 }) as DOMRect;
  chart.querySelector('svg')!.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1024, height: 350 }) as DOMRect;
  document.body.append(chart);
  return chart;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('the map cursor', () => {
  it('appears where the pointer is, on the route', () => {
    const { figure, frame } = build();
    attachRouteMap(figure);

    const cursor = figure.querySelector('.route-cursor')!;
    expect(cursor.getAttribute('visibility')).toBe('hidden');

    const [, , x, y] = route.hover[100];
    frame.dispatchEvent(pointer('pointermove', x, y));
    expect(cursor.getAttribute('visibility')).toBe('visible');
    expect(cursor.getAttribute('transform')).toBe(`translate(${x} ${y})`);
  });

  it('snaps to a sample rather than to the pointer', () => {
    // Snapping is what keeps the mark on the drawn route. A sample is every
    // 100 m, which is a few pixels at the zoom these maps use, so the reader
    // cannot see the difference between the two.
    const { figure, frame } = build();
    attachRouteMap(figure);
    const [, , x, y] = route.hover[200];
    frame.dispatchEvent(pointer('pointermove', x + 8, y + 8));

    const landed = figure.querySelector('.route-cursor')!.getAttribute('transform');
    const samples = new Set(route.hover.map(([, , sx, sy]) => `translate(${sx} ${sy})`));
    expect(samples.has(landed!)).toBe(true);
  });

  it('is placed by a tap as well as by a move', () => {
    // On touch there is no move to precede the press.
    const { figure, frame } = build();
    attachRouteMap(figure);
    const [, , x, y] = route.hover[10];
    frame.dispatchEvent(pointer('pointerdown', x, y, 'touch'));
    expect(figure.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('visible');
  });

  it('clears when a mouse leaves', () => {
    const { figure, frame } = build();
    attachRouteMap(figure);
    frame.dispatchEvent(pointer('pointermove', 300, 300));
    frame.dispatchEvent(pointer('pointerleave', 300, 300));
    expect(figure.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('hidden');
  });

  it('stays put when a finger lifts', () => {
    // Lifting fires pointerleave, and blanking then would clear the mark at
    // exactly the moment the reader wants to read it.
    const { figure, frame } = build();
    attachRouteMap(figure);
    frame.dispatchEvent(pointer('pointermove', 300, 300, 'touch'));
    frame.dispatchEvent(pointer('pointerleave', 300, 300, 'touch'));
    expect(figure.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('visible');
  });
});

describe('the chart it is paired with', () => {
  it('grows a cursor and a readout of its own', () => {
    const { figure, frame } = build({ route, trackId: 'arakawa' });
    const chart = addChart('arakawa');
    attachRouteMap(figure);

    frame.dispatchEvent(pointer('pointermove', ...([route.hover[100][2], route.hover[100][3]] as [number, number])));
    expect(chart.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('visible');
    const readout = chart.querySelector<HTMLElement>('.route-readout')!;
    expect(readout.hidden).toBe(false);
    expect(readout.textContent).toMatch(/^\d+\.\d km · [\d,]+ m$/);
  });

  it('reads a distance off the chart and marks it on the map', () => {
    const { figure } = build({ route, trackId: 'arakawa' });
    const chart = addChart('arakawa');
    attachRouteMap(figure);

    // Halfway along the plot area is halfway along the ride.
    chart.dispatchEvent(pointer('pointermove', 512, 100));
    const readout = chart.querySelector<HTMLElement>('.route-readout')!;
    const km = Number(readout.textContent!.split(' ')[0]);
    expect(km).toBeGreaterThan(route.plot.kmMax * 0.4);
    expect(km).toBeLessThan(route.plot.kmMax * 0.6);
    expect(figure.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('visible');
  });

  it('takes the caller’s wording for the readout', () => {
    const { figure, frame } = build({ route, trackId: 'arakawa' });
    const chart = addChart('arakawa');
    attachRouteMap(figure, { formatReadout: (p) => `${p.km.toFixed(2)}km` });
    frame.dispatchEvent(pointer('pointermove', route.hover[50][2], route.hover[50][3]));
    expect(chart.querySelector('.route-readout')!.textContent).toMatch(/^\d+\.\d\dkm$/);
  });

  it('works alone when there is no chart to pair with', () => {
    const { figure, frame } = build({ route, trackId: 'nothing-matches-this' });
    attachRouteMap(figure);
    frame.dispatchEvent(pointer('pointermove', 300, 300));
    expect(figure.querySelector('.route-cursor')!.getAttribute('visibility')).toBe('visible');
  });
});

describe('the legend and the markers', () => {
  it('lights the row when its marker is pointed at, and back', () => {
    const { figure } = build();
    attachRouteMap(figure);
    const marker = figure.querySelector<SVGGElement>('.route-poi[data-poi="0"]')!;
    const row = figure.querySelector<HTMLElement>('.route-map-legend li[data-poi="0"]')!;

    marker.dispatchEvent(new Event('pointerenter', { bubbles: false }));
    expect(row.classList.contains('is-active')).toBe(true);
    expect(marker.classList.contains('is-active')).toBe(true);

    marker.dispatchEvent(new Event('pointerleave', { bubbles: false }));
    expect(row.classList.contains('is-active')).toBe(false);
  });

  it('lights the marker when the row is focused, for a keyboard', () => {
    const { figure } = build();
    attachRouteMap(figure);
    const marker = figure.querySelector<SVGGElement>('.route-poi[data-poi="1"]')!;
    figure.querySelector('.route-map-legend li[data-poi="1"]')!.dispatchEvent(new Event('focusin'));
    expect(marker.classList.contains('is-active')).toBe(true);
  });
});

describe('the photo preview', () => {
  it('opens on the dot the pointer is nearest', () => {
    const { figure, frame } = build({ route, photos });
    attachRouteMap(figure);
    const dot = figure.querySelector<SVGGElement>('.route-photo')!;
    const hit = dot.querySelector<SVGCircleElement>('.route-photo-hit')!;
    hit.getBoundingClientRect = () => ({ left: 10, top: 10, width: 13, height: 13 }) as DOMRect;

    const preview = figure.querySelector<HTMLElement>('[data-photo-preview]')!;
    expect(preview.hidden).toBe(true);

    frame.dispatchEvent(pointer('pointermove', Number(hit.getAttribute('cx')), Number(hit.getAttribute('cy'))));
    expect(preview.hidden).toBe(false);
    expect(preview.querySelector('img')!.getAttribute('src')).toBe(dot.dataset.thumb);
    expect(dot.classList.contains('is-active')).toBe(true);
  });

  it('waits for the picture rather than showing the last one', () => {
    // An <img> keeps painting its old picture until the new src decodes, and a
    // frame that opened on the previous photograph reads as the wrong picture
    // rather than as a slow one.
    const { figure, frame } = build({ route, photos });
    attachRouteMap(figure);
    const dot = figure.querySelector<SVGGElement>('.route-photo')!;
    const hit = dot.querySelector<SVGCircleElement>('.route-photo-hit')!;
    hit.getBoundingClientRect = () => ({ left: 10, top: 10, width: 13, height: 13 }) as DOMRect;

    frame.dispatchEvent(pointer('pointermove', Number(hit.getAttribute('cx')), Number(hit.getAttribute('cy'))));
    const preview = figure.querySelector<HTMLElement>('[data-photo-preview]')!;
    expect(preview.hasAttribute('data-loading')).toBe(true);
  });

  it('closes when the pointer is nowhere near a dot', () => {
    const { figure, frame } = build({ route, photos });
    attachRouteMap(figure);
    const dot = figure.querySelector<SVGGElement>('.route-photo')!;
    const hit = dot.querySelector<SVGCircleElement>('.route-photo-hit')!;
    hit.getBoundingClientRect = () => ({ left: 10, top: 10, width: 13, height: 13 }) as DOMRect;

    frame.dispatchEvent(pointer('pointermove', Number(hit.getAttribute('cx')), Number(hit.getAttribute('cy'))));
    frame.dispatchEvent(pointer('pointermove', 5, 700));
    expect(figure.querySelector<HTMLElement>('[data-photo-preview]')!.hidden).toBe(true);
    expect(dot.classList.contains('is-active')).toBe(false);
  });

  it('tells the caller which photograph was clicked', () => {
    const onPhotoOpen = vi.fn();
    const { figure } = build({ route, photos, galleryid: 'rides/arakawa' });
    attachRouteMap(figure, { onPhotoOpen });

    const dot = figure.querySelector<SVGGElement>('.route-photo')!;
    dot.querySelector<SVGCircleElement>('.route-photo-hit')!.getBoundingClientRect = () =>
      ({ left: 10, top: 10, width: 13, height: 13 }) as DOMRect;
    dot.dispatchEvent(new Event('click', { bubbles: true }));

    expect(onPhotoOpen).toHaveBeenCalledWith({ galleryid: 'rides/arakawa', index: Number(dot.dataset.photo) });
  });

  it('dispatches gallery:open by default', () => {
    const gallery = document.createElement('section');
    gallery.id = 'gallery-rides/arakawa';
    document.body.append(gallery);
    const heard = vi.fn();
    gallery.addEventListener('gallery:open', heard);

    const { figure } = build({ route, photos, galleryid: 'rides/arakawa' });
    attachRouteMap(figure);
    const dot = figure.querySelector<SVGGElement>('.route-photo')!;
    dot.querySelector<SVGCircleElement>('.route-photo-hit')!.getBoundingClientRect = () =>
      ({ left: 10, top: 10, width: 13, height: 13 }) as DOMRect;
    dot.dispatchEvent(new Event('click', { bubbles: true }));

    expect(heard).toHaveBeenCalled();
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ index: Number(dot.dataset.photo) });
  });
});

describe('wiring up', () => {
  it('is safe to run twice over the same figure', () => {
    // A router that restores a cached page hands back a figure already wired,
    // and a second cursor stacked on the first would be two marks in one place.
    const { figure } = build();
    attachRouteMap(figure);
    attachRouteMap(figure);
    attachRouteMaps(document);
    expect(figure.querySelectorAll('.route-cursor')).toHaveLength(1);
  });

  it('finds every figure on the page', () => {
    build();
    build();
    attachRouteMaps(document);
    expect(document.querySelectorAll('.route-cursor')).toHaveLength(2);
  });

  it('survives a payload that will not parse', () => {
    // A broken block should cost the reader the cursor, not the page.
    const { figure } = build();
    figure.querySelector('script[data-route-hover]')!.textContent = '{ not json';
    expect(() => attachRouteMap(figure)).not.toThrow();
    expect(figure.querySelector('.route-cursor')).toBeNull();
  });

  it('does nothing without the frame it draws into', () => {
    const stray = document.createElement('figure');
    stray.setAttribute('data-route-map', '');
    document.body.append(stray);
    expect(() => attachRouteMaps(document)).not.toThrow();
  });
});
