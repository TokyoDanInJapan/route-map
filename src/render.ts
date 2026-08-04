/**
 * The markup, built as strings on the server.
 *
 * The route is drawn into the page rather than assembled in the browser, so a
 * reader with JavaScript disabled still gets the map, the places on it and the
 * legend. Only the moving parts - the synced cursor and the photo preview -
 * need `attachRouteMap`.
 *
 * Everything here is pure: give it the same route.json twice and it returns the
 * same string twice, which is what lets a static site build it once at deploy
 * time and never think about it again.
 */

import { thinHover } from './hover.js';
import { GROUP_PX, PHOTO_COLLIDE_PX, PHOTO_NUDGE, groupPhotos, placeMarkers } from './markers.js';
import type { PhotoPin, PoiCategory, RouteData } from './types.js';

/**
 * Marker colours, matching POI_STYLES in gpx-tools' maps/mapgen.py.
 *
 * Onsens and campsites carry a glyph instead of a number, so they read at a
 * glance without the legend. General sights are numbered, and the legend says
 * which is which.
 */
export const POI_STYLES: Record<PoiCategory, { fill: string; label: string }> = {
  poi: { fill: '#1565c0', label: 'Sight' },
  onsen: { fill: '#c2185b', label: 'Onsen' },
  camp: { fill: '#2e7d32', label: 'Campsite' },
};

/** A tent, drawn rather than typed - the emoji renders inconsistently. */
const TENT_PATH = 'M 0 -6 L 6.5 5 L -6.5 5 Z M 0 1.5 L 3 5 L -3 5 Z';

/**
 * Photo dots.
 *
 * Violet, and the choice is narrower than it looks. The route is coloured by
 * gradient, so it already wears every warm hue from green through yellow and
 * amber to dark red - an amber dot was tried and reads as another band of the
 * track. The tiles bring their own greens and greys, and their rivers are blue,
 * which rules out the cyan that would otherwise be the obvious contrast. That
 * leaves the cool end past blue, clear of the terrain, the water and the whole
 * of the route's ramp, and distinct from all three marker colours.
 */
export const PHOTO_FILL = '#7c3aed';

export interface RenderOptions {
  /** route.json, as written by `gpx-mapgen --overlay`. */
  route: RouteData;
  /**
   * The photographs to dot along the route, with their thumbnails already
   * resolved. Omit them and the map is drawn without any.
   */
  photos?: readonly PhotoPin[];
  /**
   * Ties this map to an elevation chart carrying the same id, so hovering
   * either one marks the same spot on both.
   */
  trackId?: string;
  /** Passed back to the photo-click handler, so a click can open the gallery. */
  galleryid?: string;
}

export interface RouteMapMarkup {
  /** Attributes for the outer element. Spread them onto a `<figure>`. */
  figureAttrs: Record<string, string>;
  /** The overlay `<svg>`, to place inside the frame after the image. */
  overlay: string;
  /** The photo preview and its leader line. Empty when there are no photos. */
  preview: string;
  /** The legend list. Empty when the route names no places. */
  legend: string;
  /** The inert JSON the client reads back. Place it inside the figure. */
  data: string;
  /** How many photo dots were drawn, so a caller can skip the preview markup. */
  photoCount: number;
}

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (value: string) => escapeText(value).replace(/"/g, '&quot;');

/** `undefined` drops the attribute, which is how the optional ones stay optional. */
const attrs = (pairs: Record<string, string | number | undefined>) =>
  Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
    .join('');

export function renderRouteMap(options: RenderOptions): RouteMapMarkup {
  const { route, photos = [], trackId, galleryid } = options;
  const { w, h } = route.map;

  // Drawn in three complete passes - dark outline, white casing, then the
  // gradient colours - rather than three strokes per run. Interleaving would
  // let one run's casing overdraw its neighbour's colour at the joint between
  // bands.
  //
  // The outline is what makes the route read against the tiles: white alone
  // disappears into pale terrain, and putting the dark straight under the
  // colour muddies the yellows and greens. The white between the two keeps the
  // grade bands clean while the dark does the separating.
  const runs = route.route.map((run) => ({
    colour: run.c,
    points: run.pts.map(([x, y]) => `${x},${y}`).join(' '),
  }));

  const pass = (stroke: string | null, width: number) =>
    `<g${stroke ? '' : ' class="route-line"'} fill="none"${stroke ? ` stroke="${stroke}"` : ''} ` +
    `stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">` +
    runs
      .map((run) => `<polyline points="${run.points}"${stroke ? '' : ` stroke="${escapeAttr(run.colour)}"`} />`)
      .join('') +
    '</g>';

  const pois = placeMarkers(route.pois ?? [], w, h);

  // A photograph is drawn only if it was placed on the route at all. One
  // without map coordinates was placed by distance alone, which the flown
  // route can use and a flat map cannot.
  const pins = photos.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const photoDots = placeMarkers(groupPhotos(pins, GROUP_PX), w, h, PHOTO_COLLIDE_PX, PHOTO_NUDGE, 6);

  // Photo dots go under the place markers: a place named in the write-up is the
  // more important mark, and there are ten times as many photographs.
  const photoMarkup = photoDots
    .map(({ item, mx, my, leader }) => {
      const first = item.members[0];
      const count = item.members.length;
      const line = leader
        ? `<line x1="${item.x}" y1="${item.y}" x2="${mx}" y2="${my}" stroke="#fff" stroke-width="2.5" />` +
          `<line x1="${item.x}" y1="${item.y}" x2="${mx}" y2="${my}" stroke="${PHOTO_FILL}" stroke-width="1.2" />`
        : '';
      const label = count > 1 ? `${count} photos here` : first.alt;
      const badge =
        count > 1
          ? `<text x="${mx}" y="${my + 2.6}" text-anchor="middle" fill="#fff" font-size="7" ` +
            `font-weight="700" font-family="ui-sans-serif,system-ui,sans-serif" pointer-events="none">${count}</text>`
          : '';
      return (
        `<g class="route-photo"${attrs({
          'data-photo': first.index,
          'data-thumb': first.thumb,
          'data-alt': first.alt,
          'data-count': count,
        })}>` +
        line +
        `<title>${escapeText(label)}</title>` +
        // A hit area bigger than the dot, but still inside PHOTO_COLLIDE_PX so
        // no dot can swallow its neighbour's hover.
        `<circle class="route-photo-hit" cx="${mx}" cy="${my}" r="6.5" fill="transparent" />` +
        `<circle class="route-photo-dot" cx="${mx}" cy="${my}" r="${count > 1 ? 5.5 : 4}" ` +
        `fill="${PHOTO_FILL}" stroke="#fff" stroke-width="1.5" />` +
        badge +
        '</g>'
      );
    })
    .join('');

  // Leaders and the dots they point at, under every marker so no line crosses a
  // disc it does not belong to.
  const leaderMarkup = pois
    .filter((p) => p.leader)
    .map(({ item, mx, my }) => {
      const fill = POI_STYLES[item.category].fill;
      return (
        '<g class="route-poi-leader">' +
        `<line x1="${item.x}" y1="${item.y}" x2="${mx}" y2="${my}" stroke="#fff" stroke-width="4" />` +
        `<line x1="${item.x}" y1="${item.y}" x2="${mx}" y2="${my}" stroke="${fill}" stroke-width="2" />` +
        `<circle cx="${item.x}" cy="${item.y}" r="3.5" fill="${fill}" stroke="#fff" stroke-width="1.5" />` +
        '</g>'
      );
    })
    .join('');

  const poiMarkup = pois
    .map(({ item: poi, mx, my }, i) => {
      const glyph =
        poi.num !== null
          ? `<text y="4.5" text-anchor="middle" fill="#fff" font-size="14" font-weight="700" ` +
            `font-family="ui-sans-serif,system-ui,sans-serif">${escapeText(String(poi.num))}</text>`
          : poi.category === 'camp'
            ? `<path d="${TENT_PATH}" fill="#fff" />`
            : '<text y="6" text-anchor="middle" fill="#fff" font-size="17" font-family="serif">♨︎</text>';

      const marker =
        `<g class="route-poi" data-poi="${i}" transform="translate(${mx} ${my})">` +
        // Names the pin on hover, and gives the disc a target slightly bigger
        // than itself - still inside COLLIDE_PX, so no marker can swallow a
        // neighbour's clicks.
        `<title>${escapeText(poi.name)}</title>` +
        '<circle class="route-poi-hit" r="15" fill="transparent" />' +
        `<circle r="13" fill="${POI_STYLES[poi.category].fill}" stroke="#fff" stroke-width="2" />` +
        glyph +
        '</g>';

      // The pin goes where the legend row goes - the marker is the same link,
      // aimed at with the eye instead of read off a list.
      //
      // Deliberately out of the tab order: the legend already offers every one
      // of these links, in reading order and with the name attached, so a second
      // focusable copy would only make a keyboard user tab through the same set
      // twice. That is also what keeps the anchor legal inside an aria-hidden
      // <svg>.
      return poi.url
        ? `<a href="${escapeAttr(poi.url)}" rel="noopener" tabindex="-1" aria-hidden="true">${marker}</a>`
        : marker;
    })
    .join('');

  const overlay =
    `<svg class="route-map-overlay" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" ` +
    'aria-hidden="true" focusable="false">' +
    pass('#1f2937', 10) +
    pass('#fff', 7) +
    // Classed because the script reads these points back to keep a photo
    // preview off the route. The three passes carry identical geometry, so it
    // wants exactly one of them.
    pass(null, 4) +
    photoMarkup +
    leaderMarkup +
    poiMarkup +
    '</svg>';

  // The preview and the line joining it to its dot.
  //
  // Offset from the dot rather than centred on it, so the picture never covers
  // the stretch of route it is pointing at, and joined by a line so the offset
  // stays honest about which dot it belongs to.
  //
  // One preview for the whole map, moved and re-pointed as the pointer goes from
  // dot to dot, rather than a hundred and fifty images sitting in the page
  // waiting to be hovered. Its src is set from the dot's data-thumb on first
  // hover, so nothing is fetched until it is asked for.
  //
  // HTML rather than a foreignObject in the overlay: that would scale with the
  // viewBox, so the preview would be tiny on a phone and huge on a desktop, when
  // what it wants is a fixed readable size either way.
  const preview = photoDots.length
    ? '<svg class="route-photo-link" data-photo-link aria-hidden="true" focusable="false">' +
      '<line x1="0" y1="0" x2="0" y2="0" /></svg>' +
      '<div class="route-photo-preview" data-photo-preview hidden aria-hidden="true">' +
      '<img alt="" decoding="async" />' +
      // Shown while the thumbnail is still on its way, in a frame held open at
      // 3:2 - see the note on `show` in client.ts.
      '<span class="route-photo-wait" aria-hidden="true"></span></div>'
    : '';

  const legend = pois.length
    ? '<ul class="route-map-legend">' +
      pois
        .map(({ item: poi }, i) => {
          const badge = poi.num !== null ? String(poi.num) : poi.category === 'camp' ? '⛺︎' : '♨︎';
          const name = poi.url
            ? `<a href="${escapeAttr(poi.url)}" rel="noopener">${escapeText(poi.name)}</a>`
            : `<span>${escapeText(poi.name)}</span>`;
          return (
            `<li data-poi="${i}">` +
            `<span class="route-map-badge" style="background:${POI_STYLES[poi.category].fill}" aria-hidden="true">` +
            `${escapeText(badge)}</span>` +
            name +
            `<span class="route-map-sr"> (${POI_STYLES[poi.category].label})</span>` +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    : '';

  // Only what the cursor needs. The drawn geometry is already in the markup.
  const data = JSON.stringify({
    map: { w, h },
    plot: route.plot,
    hover: thinHover(route.hover, route.plot),
  });

  return {
    figureAttrs: {
      class: 'route-map',
      'data-route-map': '',
      ...(trackId ? { 'data-track-id': trackId } : {}),
      ...(photoDots.length && galleryid ? { 'data-galleryid': galleryid } : {}),
    },
    overlay,
    preview,
    legend,
    data,
    photoCount: photoDots.length,
  };
}
