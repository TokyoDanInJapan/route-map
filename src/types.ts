/**
 * The data these graphics are drawn from.
 *
 * All of it comes out of `gpx-tools` - `gpx-mapgen --overlay` writes the route
 * and the places, `gpx-photo-points` writes the photographs. Nothing here is
 * computed in the browser, and nothing is read from a server: a page hands the
 * JSON straight to `renderRouteMap`.
 */

/**
 * One sample of the ride: [km, elevation in metres, map x, map y, segment].
 *
 * These are the 100 m resampled points the elevation profile is drawn from, so
 * a cursor placed with them sits on the line the reader can see. The segment
 * index exists because a track split at a teleport jumps in space while
 * distance keeps climbing - two samples either side of a gap must not be
 * interpolated between.
 */
export type HoverRow = readonly [km: number, ele: number, x: number, y: number, seg: number];

/** The elevation chart's coordinate system, as emitted into route.json. */
export interface PlotGeometry {
  /** viewBox width - the units every other field here is measured in. */
  w: number;
  /** viewBox height. */
  h: number;
  /** Left padding, in viewBox units, before the plot area starts. */
  padL: number;
  /** Width of the plot area, in viewBox units. */
  plotW: number;
  /** Top padding, in viewBox units, before the plot area starts. */
  padT: number;
  /** Height of the plot area, in viewBox units. */
  plotH: number;
  /** Distance at the left edge of the plot. */
  kmMin: number;
  /** Distance at the right edge of the plot. */
  kmMax: number;
  /** Elevation at the bottom of the plot area. */
  yLo: number;
  /** Elevation at the top of the plot area. */
  yHi: number;
}

/** A resolved position on the ride, in both graphics' coordinates. */
export interface TrackPoint {
  km: number;
  ele: number;
  /** Map image pixel. */
  x: number;
  /** Map image pixel. */
  y: number;
}

/** What kind of place a marker stands for. */
export type PoiCategory = 'poi' | 'onsen' | 'camp';

/** A place named in the write-up, projected into the map image's pixel space. */
export interface Poi {
  name: string;
  category: PoiCategory;
  url: string | null;
  /** Sequential number for general sights, null for onsens and campsites. */
  num: number | null;
  x: number;
  y: number;
}

/** route.json, as written by `gpx-mapgen --overlay`. */
export interface RouteData {
  /** The map image's pixel dimensions, and its Web Mercator bounds. */
  map: { w: number; h: number; u0: number; u1: number; v0: number; v1: number };
  /** Gradient-banded polylines in the image's own pixel space. */
  route: { c: string; seg: number; pts: [number, number, number][] }[];
  /** The lookup behind the synced cursor. */
  hover: HoverRow[];
  /** The places linked in the write-up. */
  pois?: Poi[];
  /** The elevation chart's coordinate system, for placing its cursor. */
  plot: PlotGeometry;
}

/**
 * One photograph, ready to draw.
 *
 * `thumb` and `alt` are resolved by the caller rather than here. Which sizes
 * exist, and what a picture with no caption should be called, are properties of
 * the site's image pipeline - see the Astro example, where both come from
 * `getImage` and the gallery manifest.
 */
export interface PhotoPin {
  /** Map image pixel, from photos.json. */
  x: number;
  y: number;
  /** Distance along the ride, which is the only position photos.json stores. */
  km: number;
  /** The photograph's index in its gallery, so a click can open it there. */
  index: number;
  /** Thumbnail URL. */
  thumb: string;
  alt: string;
}

/** Anything `placeMarkers` can move: a marker is a point until it is drawn. */
export interface Point {
  x: number;
  y: number;
}
