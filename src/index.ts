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

// Everything the server entry exports, plus the client. Listed once, in
// server.ts, so the two entry points cannot disagree about the shared half.
export * from './server.js';

export { attachRouteMap, attachRouteMaps } from './client.js';
export type { AttachOptions } from './client.js';
