/**
 * The moving parts: the cursor shared with the elevation chart, and the photo
 * preview.
 *
 * Everything this touches is already in the page - `renderRouteMap` drew the
 * route, the dots and the legend, and left an inert JSON block for the lookup
 * table. Nothing here fetches anything except a thumbnail somebody pointed at.
 */

import { chartXOfKm, chartYOfEle, kmAtChartX, nearestPoint, pointAtKm } from './hover.js';
import type { HoverRow, PlotGeometry, TrackPoint } from './types.js';

interface HoverData {
  map: { w: number; h: number };
  plot: PlotGeometry;
  hover: HoverRow[];
}

export interface AttachOptions {
  /**
   * What a click on a photo dot, or on the preview, should do.
   *
   * The default dispatches a `gallery:open` CustomEvent, carrying the
   * photograph's index, at the element with id `gallery-<galleryid>`. That is a
   * convention rather than a law - pass your own to open a different viewer.
   */
  onPhotoOpen?: (detail: { galleryid: string | undefined; index: number }) => void;
  /** How the readout above the chart is worded. */
  formatReadout?: (point: TrackPoint) => string;
  /** Locale for the default readout's thousands separator. */
  locale?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const svgEl = <K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

/** Distance with one decimal, elevation whole - matching the chart's own axes. */
const defaultReadout = (point: TrackPoint, locale?: string) =>
  `${point.km.toFixed(1)} km · ${Math.round(point.ele).toLocaleString(locale)} m`;

const defaultPhotoOpen = ({ galleryid, index }: { galleryid: string | undefined; index: number }) => {
  if (!galleryid) return;
  const gallery = document.getElementById(`gallery-${galleryid}`);
  gallery?.dispatchEvent(new CustomEvent('gallery:open', { detail: { index } }));
};

/**
 * Wire up one route map.
 *
 * Safe to call twice on the same element: a router that restores a cached page
 * hands back a figure that is already wired, and setting up again would stack a
 * second cursor on top of the first.
 */
export function attachRouteMap(figure: HTMLElement, options: AttachOptions = {}): void {
  if (figure.dataset.routeMapReady) return;
  figure.dataset.routeMapReady = 'true';

  const dataEl = figure.querySelector<HTMLScriptElement>('script[data-route-hover]');
  const frame = figure.querySelector<HTMLElement>('.route-map-frame');
  const overlay = figure.querySelector<SVGSVGElement>('.route-map-overlay');
  if (!dataEl?.textContent || !frame || !overlay) return;

  let data: HoverData;
  try {
    data = JSON.parse(dataEl.textContent) as HoverData;
  } catch {
    return; // A broken payload should cost the reader the hover, nothing more.
  }
  if (!data.hover?.length) return;

  const readoutText = options.formatReadout ?? ((point: TrackPoint) => defaultReadout(point, options.locale));

  // Point a legend row at its marker, and back. The legend names places the map
  // can only number, so tying the two saves counting pins - and since a marker
  // is itself a link, lighting the row from the map end says what a numbered pin
  // is about to open before it is clicked.
  const rows = new Map<string, HTMLElement>();
  figure
    .querySelectorAll<HTMLElement>('.route-map-legend li[data-poi]')
    .forEach((row) => rows.set(row.dataset.poi!, row));

  figure.querySelectorAll<SVGGElement>('.route-poi[data-poi]').forEach((marker) => {
    const row = rows.get(marker.dataset.poi!);
    const on = () => {
      marker.classList.add('is-active');
      row?.classList.add('is-active');
    };
    const off = () => {
      marker.classList.remove('is-active');
      row?.classList.remove('is-active');
    };
    marker.addEventListener('pointerenter', on);
    marker.addEventListener('pointerleave', off);
    if (!row) return;
    row.addEventListener('pointerenter', on);
    row.addEventListener('pointerleave', off);
    // Keyboard users tab to the link inside the row, not the row itself.
    row.addEventListener('focusin', on);
    row.addEventListener('focusout', off);
  });

  /**
   * Do not let a scrub that happens to start on a marker end in a navigation.
   *
   * Dragging across the map is how the cursor is moved, and on touch the browser
   * still calls a drag that begins and ends on the same link a click. Someone
   * reading the profile with a finger on a pin would be thrown off the page.
   * Anything past a few pixels is a scrub, not a tap.
   */
  let downAt: { x: number; y: number } | null = null;
  frame.addEventListener('pointerdown', (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  frame.addEventListener(
    'click',
    (event) => {
      if (downAt && Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 8) event.preventDefault();
    },
    true // Capture, so the decision lands before the anchor acts on it.
  );

  const trackId = figure.dataset.trackId;
  const chart = trackId ? document.querySelector<HTMLElement>(`[data-elevation-chart="${CSS.escape(trackId)}"]`) : null;
  const chartSvg = chart?.querySelector('svg') ?? null;

  // The map's marker. Sized in image pixels, like everything else in here.
  const mapMarker = svgEl('g', { class: 'route-cursor', visibility: 'hidden' });
  mapMarker.append(
    svgEl('circle', { r: '13', fill: '#fff', 'fill-opacity': '0.9' }),
    svgEl('circle', { r: '8', fill: '#1565c0', stroke: '#fff', 'stroke-width': '3' })
  );
  overlay.append(mapMarker);

  // The chart's marker: a rule down the plot area plus a dot on the trace.
  let chartCursor: SVGGElement | null = null;
  let chartRule: SVGLineElement | null = null;
  let chartDot: SVGCircleElement | null = null;
  let readout: HTMLElement | null = null;

  if (chartSvg && chart) {
    const { padT, plotH } = data.plot;
    chartCursor = svgEl('g', { class: 'route-cursor', visibility: 'hidden' });
    chartRule = svgEl('line', {
      y1: String(padT),
      y2: String(padT + plotH),
      stroke: '#1565c0',
      'stroke-width': '1.5',
    });
    chartDot = svgEl('circle', { r: '5', fill: '#1565c0', stroke: '#fff', 'stroke-width': '2' });
    chartCursor.append(chartRule, chartDot);
    chartSvg.append(chartCursor);

    readout = document.createElement('div');
    readout.className = 'route-readout';
    readout.hidden = true;
    chart.append(readout);
  }

  const show = (point: TrackPoint) => {
    mapMarker.setAttribute('transform', `translate(${point.x} ${point.y})`);
    mapMarker.setAttribute('visibility', 'visible');

    if (!chartCursor || !chartRule || !chartDot || !readout || !chart) return;
    const x = chartXOfKm(point.km, data.plot);
    const y = chartYOfEle(point.ele, data.plot);
    chartRule.setAttribute('x1', String(x));
    chartRule.setAttribute('x2', String(x));
    chartDot.setAttribute('cx', String(x));
    chartDot.setAttribute('cy', String(y));
    chartCursor.setAttribute('visibility', 'visible');

    readout.textContent = readoutText(point);
    readout.hidden = false;
    // The badge is centred on the cursor, so keep it half its own width clear of
    // either edge. The chart frame clips, and a badge hanging off the start of
    // the ride would lose its first character.
    const chartWidth = chart.clientWidth;
    const half = readout.offsetWidth / 2;
    const wanted = (x / data.plot.w) * chartWidth;
    readout.style.left = `${Math.min(chartWidth - half, Math.max(half, wanted))}px`;
  };

  const hide = () => {
    mapMarker.setAttribute('visibility', 'hidden');
    chartCursor?.setAttribute('visibility', 'hidden');
    if (readout) readout.hidden = true;
  };

  /**
   * Clear on the way out - but only for a pointer that has an "out".
   *
   * Lifting a finger fires pointerleave, so honouring it on touch would blank
   * the cursor the instant a reader stopped scrubbing, which is exactly when
   * they want to read it. A finger has no hover state to leave. The mark stays
   * where it was put, until the next touch moves it.
   */
  const hideUnlessTouch = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') hide();
  };

  // The map: find the nearest point of the route to the pointer. pointerdown as
  // well as pointermove, so a tap places the mark - on touch there is no move to
  // precede it.
  const trackMap = (event: PointerEvent) => {
    const rect = frame.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * data.map.w;
    const y = ((event.clientY - rect.top) / rect.height) * data.map.h;
    const point = nearestPoint(data.hover, x, y);
    if (point) show(point);
  };
  frame.addEventListener('pointermove', trackMap);
  frame.addEventListener('pointerdown', trackMap);
  frame.addEventListener('pointerleave', hideUnlessTouch);
  frame.addEventListener('pointercancel', hideUnlessTouch);

  // The chart: read a distance off its x axis.
  if (chart && chartSvg) {
    const trackChart = (event: PointerEvent) => {
      const rect = chartSvg.getBoundingClientRect();
      if (!rect.width) return;
      const x = ((event.clientX - rect.left) / rect.width) * data.plot.w;
      const point = pointAtKm(data.hover, kmAtChartX(x, data.plot));
      if (point) show(point);
    };
    chart.addEventListener('pointermove', trackChart);
    chart.addEventListener('pointerdown', trackChart);
    chart.addEventListener('pointerleave', hideUnlessTouch);
    chart.addEventListener('pointercancel', hideUnlessTouch);
  }

  setUpPhotoPreview(figure, frame, data, options);
}

/**
 * Show a photograph's thumbnail while the pointer is on its dot.
 *
 * The preview is one element re-pointed rather than one per photograph, and its
 * `src` is only set the first time a given dot is hovered - a 150-photo gallery
 * would otherwise fetch 150 thumbnails to show at most one.
 *
 * Position is read from the dot's own laid-out geometry rather than from the
 * viewBox numbers, so it stays right at any rendered size without the script
 * having to know the scale factor.
 */
function setUpPhotoPreview(
  figure: HTMLElement,
  frame: HTMLElement,
  data: HoverData,
  options: AttachOptions
): void {
  const preview = figure.querySelector<HTMLElement>('[data-photo-preview]');
  const image = preview?.querySelector('img');
  const link = figure.querySelector<SVGSVGElement>('[data-photo-link]');
  const linkLine = link?.querySelector('line');
  const dots = figure.querySelectorAll<SVGGElement>('.route-photo[data-photo]');
  if (!preview || !image || !link || !linkLine || !dots.length) return;

  /**
   * The route, in the map image's own pixel space.
   *
   * Read off the polylines that are actually drawn rather than out of the hover
   * table: the table is thinned to about one sample per unit of the chart's x
   * axis, so on a long straight a thumbnail could sit between two samples and be
   * scored clear of a road it is lying across. These are the same points the
   * reader can see, which is what "does this cover the route" has to mean.
   */
  const routePoints: [number, number][] = [];
  figure.querySelectorAll<SVGPolylineElement>('.route-map-overlay .route-line polyline').forEach((line) => {
    for (const pair of (line.getAttribute('points') || '').split(' ')) {
      const [x, y] = pair.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) routePoints.push([x, y]);
    }
  });

  let active: SVGGElement | null = null;

  const hide = () => {
    if (!active) return;
    active.classList.remove('is-active');
    active = null;
    preview.hidden = true;
    preview.removeAttribute('data-loading');
    link.setAttribute('hidden', '');
  };

  /**
   * Which dot the frame is showing.
   *
   * The pointer can leave a dot for another one while the first thumbnail is
   * still arriving, and a decode that resolves after that must not paint itself
   * over the picture that replaced it.
   */
  let generation = 0;

  const show = (dot: SVGGElement) => {
    const hit = dot.querySelector<SVGCircleElement>('.route-photo-hit');
    const thumb = dot.dataset.thumb;
    if (!hit || !thumb) return;
    const mine = ++generation;

    if (image.getAttribute('src') !== thumb) {
      image.setAttribute('src', thumb);
      image.setAttribute('alt', dot.dataset.alt ?? '');
    }

    if (active && active !== dot) active.classList.remove('is-active');
    active = dot;
    dot.classList.add('is-active');

    // A thumbnail that has not arrived is never shown as the previous one. An
    // `<img>` keeps painting its old picture until the new `src` has decoded, so
    // on a phone the frame carried the last dot's photograph for a second and
    // then flicked - which reads as the wrong picture rather than as a slow one.
    // `complete` alone would not do: a src that failed is complete too, and its
    // frame would open on a broken picture.
    const ready = image.complete && image.naturalWidth > 0;
    if (ready) preview.removeAttribute('data-loading');
    else preview.setAttribute('data-loading', '');

    place(hit);
    if (ready) return;

    // The thumbnail's height depends on the photograph's shape, and until it
    // arrives the frame is the placeholder's 3:2 - so the search below has been
    // scoring a box of the wrong height, and the picture would land where that
    // box fitted. Placing again is what makes the first sight of a photograph
    // land in the right spot. A landscape shot following a portrait is where it
    // shows.
    //
    // `decode()` rather than the load event, because load fires before the
    // picture is ready to paint and the flicker is exactly that gap.
    image
      .decode()
      .then(() => {
        if (mine !== generation) return; // The pointer has moved on.
        preview.removeAttribute('data-loading');
        place(hit);
      })
      .catch(() => {
        // A thumbnail that will not decode is worth less than the map it is
        // covering, so the frame comes down rather than sitting there empty.
        if (mine === generation) hide();
      });
  };

  /** Put the preview somewhere clear of the route, and join it to its dot. */
  const place = (hit: SVGCircleElement) => {
    // Measured against the frame, which is what both overlays are positioned
    // within and what the picture must stay inside.
    const dotBox = hit.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    const dotX = dotBox.left + dotBox.width / 2 - frameBox.left;
    const dotY = dotBox.top + dotBox.height / 2 - frameBox.top;

    preview.hidden = false;
    link.removeAttribute('hidden');
    link.setAttribute('viewBox', `0 0 ${frameBox.width} ${frameBox.height}`);

    const halfW = preview.offsetWidth / 2;
    const halfH = preview.offsetHeight / 2;
    const gap = 30;

    // The route in the frame's CSS pixels. Read per show rather than cached: the
    // map is responsive, so the scale changes with the column width.
    const scale = data.map.w ? frameBox.width / data.map.w : 1;

    /** How much of the route a thumbnail centred here would cover. */
    const covered = (cx: number, cy: number) => {
      const left = cx - halfW;
      const right = cx + halfW;
      const top = cy - halfH;
      const bottom = cy + halfH;
      let hits = 0;
      for (const [px, py] of routePoints) {
        const x = px * scale;
        const y = py * scale;
        if (x >= left && x <= right && y >= top && y <= bottom) hits++;
      }
      return hits;
    };

    // Eight places to put it, tried in order of preference: up and to the right
    // first, because a consistent habit is easier to follow than an optimal one.
    // The first candidate that covers no route at all wins. If the dot is
    // somewhere the route wraps around - a hairpin, a switchback - none will be
    // clear, and the least bad is taken instead.
    const dirs: [number, number][] = [
      [1, -1],
      [-1, -1],
      [1, 1],
      [-1, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
      [0, 1],
    ];

    // Two rings: close in first, then further out. Where the route doubles back
    // on itself - the turn of an out-and-back, a pass with switchbacks - every
    // close position lies across some of it, and stepping back is what finds the
    // clear ground. Reaching for the far ring first would push the picture away
    // from its dot for no reason on the other ninety per cent.
    let best = { x: dotX, y: dotY, hits: Infinity };
    search: for (const reach of [1, 2.1]) {
      for (const [dx, dy] of dirs) {
        // Clamped before it is scored, so what is measured is where it lands.
        const cx = Math.min(frameBox.width - halfW - 2, Math.max(halfW + 2, dotX + dx * (gap + halfW) * reach));
        const cy = Math.min(frameBox.height - halfH - 2, Math.max(halfH + 2, dotY + dy * (gap + halfH) * reach));
        const hits = covered(cx, cy);
        if (hits < best.hits) best = { x: cx, y: cy, hits };
        if (!hits) break search;
      }
    }

    const { x, y } = best;
    preview.style.left = `${x}px`;
    preview.style.top = `${y}px`;

    linkLine.setAttribute('x1', String(dotX));
    linkLine.setAttribute('y1', String(dotY));
    linkLine.setAttribute('x2', String(x));
    linkLine.setAttribute('y2', String(y));
  };

  /**
   * Open the gallery at whichever photograph is being previewed.
   *
   * The dots are deliberately not in the tab order, for the same reason the
   * place markers are not: a gallery under the write-up already offers every one
   * of these pictures as a real button, in reading order, so a second focusable
   * copy would only make a keyboard user tab through the set twice. This is the
   * pointer's shortcut to it, not the only way there.
   */
  const openGallery = (dot: SVGGElement) => {
    const index = Number(dot.dataset.photo);
    if (Number.isNaN(index)) return;
    (options.onPhotoOpen ?? defaultPhotoOpen)({ galleryid: figure.dataset.galleryid, index });
  };

  /**
   * How near the pointer has to come, in CSS pixels, to summon a photograph.
   *
   * Not `pointerenter` on the dot, which is what this did first and is why
   * previews were easy to miss. The overlay is drawn in the map image's
   * 1024-unit space and rendered at around 0.71 of it, so a 6.5-unit hit ring is
   * a nine-pixel target on screen. A pointer moving at any speed steps clean over
   * one between two samples and no enter ever fires. Asking the frame for the
   * nearest dot instead makes the catchment generous without spreading the
   * markers further apart to get it.
   */
  const REACH_PX = 22;

  /** Dot centres in the overlay's own units, read once - they do not move. */
  const centres = Array.from(dots, (dot) => {
    const hit = dot.querySelector<SVGCircleElement>('.route-photo-hit');
    return { dot, cx: Number(hit?.getAttribute('cx')), cy: Number(hit?.getAttribute('cy')) };
  }).filter((c) => Number.isFinite(c.cx) && Number.isFinite(c.cy));

  frame.addEventListener('pointermove', (event) => {
    // Over the picture itself, which is a target of its own: leaving it up is
    // what lets the reader move onto it and click.
    if (active && preview.contains(event.target as Node)) return;

    const frameBox = frame.getBoundingClientRect();
    const scale = data.map.w ? frameBox.width / data.map.w : 1;
    const px = event.clientX - frameBox.left;
    const py = event.clientY - frameBox.top;

    let nearest: SVGGElement | null = null;
    let best = REACH_PX;
    for (const { dot, cx, cy } of centres) {
      const dist = Math.hypot(px - cx * scale, py - cy * scale);
      if (dist < best) {
        best = dist;
        nearest = dot;
      }
    }

    if (!nearest) hide();
    else if (nearest !== active) show(nearest);
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      show(dot);
      openGallery(dot);
    });
  });

  // The picture itself opens too - having previewed it, that is the thing the
  // reader is looking at and the thing they will aim for.
  preview.addEventListener('click', () => {
    if (active) openGallery(active);
  });

  frame.addEventListener('pointerleave', hide);
  frame.addEventListener('pointercancel', hide);
}

/**
 * Wire up every route map under `root`.
 *
 * Call it again after a client-side navigation. Figures already wired are
 * skipped, so calling it more often than necessary costs a query and nothing
 * else.
 */
export function attachRouteMaps(root: ParentNode = document, options: AttachOptions = {}): void {
  root.querySelectorAll<HTMLElement>('[data-route-map]').forEach((figure) => attachRouteMap(figure, options));
}
