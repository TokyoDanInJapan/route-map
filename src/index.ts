/**
 * route-map - a GPX route drawn over map tiles as SVG, with a cursor it shares
 * with its elevation profile.
 *
 * Two halves, and they are meant to be used together. `renderRouteMap` builds
 * the markup on the server, so the map is in the page with JavaScript off.
 * `attachRouteMap` wires up the parts that move.
 *
 * The data comes from gpx-tools: `gpx-mapgen --overlay` writes route.json, and
 * `gpx-photo-points` writes photos.json.
 */

export { renderRouteMap, POI_STYLES, PHOTO_FILL } from './render.js';
export type { RenderOptions, RouteMapMarkup } from './render.js';

export { attachRouteMap, attachRouteMaps } from './client.js';
export type { AttachOptions } from './client.js';

export { chartXOfKm, chartYOfEle, kmAtChartX, nearestPoint, pointAtKm, thinHover } from './hover.js';
export { placeMarkers, groupPhotos, COLLIDE_PX, GROUP_PX, PHOTO_COLLIDE_PX } from './markers.js';
export type { Placed, Group } from './markers.js';

export type { HoverRow, PhotoPin, PlotGeometry, Poi, PoiCategory, Point, RouteData, TrackPoint } from './types.js';
