/**
 * The server half on its own - the markup builder and the maths behind it, with
 * nothing that touches the DOM.
 *
 * Importing this rather than the package root keeps `client.ts` out of a
 * server bundle. The root is safe to import anywhere too, since nothing runs at
 * module load, but a build that never sees the browser code cannot accidentally
 * ship it.
 */

export { renderRouteMap, POI_STYLES, PHOTO_FILL } from './render.js';
export type { RenderOptions, RouteMapMarkup } from './render.js';
export { chartXOfKm, chartYOfEle, kmAtChartX, nearestPoint, pointAtKm, thinHover } from './hover.js';
export { placeMarkers, groupPhotos, COLLIDE_PX, GROUP_PX, PHOTO_COLLIDE_PX } from './markers.js';
export type { Placed, Group } from './markers.js';
export type { HoverRow, PhotoPin, PlotGeometry, Poi, PoiCategory, Point, RouteData, TrackPoint } from './types.js';
