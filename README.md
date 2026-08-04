# route-map

A GPX route drawn over map tiles as SVG, with a cursor it shares with its
elevation profile. Framework-free, about 25 KB of source, no dependencies.

Move the pointer over the map and the profile marks the same spot. Move it over
the profile and the map does. Photographs taken along the way sit on the route
as dots, and show themselves when you point at one.

## Why it is vector

The tiles are a JPEG. Everything drawn on top of them is not, and three things
fall out of that:

- **It stays crisp.** The picture is 1024 px wide and renders at around 720 CSS
  px, so on a 2x screen a baked-in line is an upscaled, JPEG-softened edge.
- **It can be coloured by gradient**, using the same bands as the elevation
  profile beside it, so the two graphics agree about what counts as steep.
- **Every point carries how far along the ride it is**, which is what lets
  either graphic mark a spot on the other.

The route is drawn on the server, so it is in the page with JavaScript off. Only
the cursor and the photo preview need a script.

## Install

```bash
npm install github:TokyoDanInJapan/route-map#v1.0.0
```

Pin the tag. This package reads JSON that
[gpx-tools](https://github.com/TokyoDanInJapan/gpx-tools) writes, and a
consumer that follows `main` can have both ends move under it at once.

## Use

Two halves. The first builds markup and can run anywhere:

```ts
import { renderRouteMap } from 'route-map/server';
import 'route-map/styles.css';

const { figureAttrs, overlay, preview, legend, data } = renderRouteMap({
  route,            // route.json, from `gpx-mapgen --overlay`
  photos: pins,     // optional, with thumbnails you have resolved
  trackId: 'my-ride',
  galleryid: 'cycling/day-trips/my-ride',
});
```

Put the pieces together in whatever your site renders with. The order matters -
the overlay sits on the image, and the preview sits on both:

```html
<figure class="route-map" data-route-map data-track-id="my-ride">
  <div class="route-map-frame">
    <img src="map.jpg" alt="Map" width="1024" height="768" />
    <!-- overlay -->
    <!-- preview -->
  </div>
  <!-- legend -->
  <script type="application/json" data-route-hover><!-- data --></script>
</figure>
```

The second half wires up what moves:

```ts
import { attachRouteMaps } from 'route-map/client';

attachRouteMaps();               // every figure on the page
```

Call it again after a client-side navigation. Figures already wired are skipped.

There is a ready-made Astro pair in [`examples/astro/`](examples/astro/), which
is where a real site's own concerns live - see its README for the list.

## Pairing it with the profile

Give the map a `trackId`, and give the profile's wrapper the same one as
`data-elevation-chart`:

```html
<div class="elevation-chart-frame" data-elevation-chart="my-ride"><!-- the SVG --></div>
```

That is the whole contract. The map finds the chart, injects a rule and a dot
into its SVG, and appends a readout. A chart with no map beside it stays a still
picture, and a map with no chart still works on its own.

## Options

`attachRouteMap(figure, options)` and `attachRouteMaps(root, options)` take:

| option | what it does |
| --- | --- |
| `onPhotoOpen` | what a click on a dot or on the preview should do |
| `formatReadout` | how the readout above the profile is worded |
| `locale` | the thousands separator in the default readout |

`onPhotoOpen` defaults to dispatching a `gallery:open` CustomEvent, carrying the
photograph's index, at the element with id `gallery-<galleryid>`. That is the
convention this was extracted from rather than a law - pass your own function to
open a different viewer.

## The data

Both files come from `gpx-tools`, and neither is fetched at runtime:

```bash
gpx-mapgen ride.gpx --outdir out/ --post ride.mdx --overlay
gpx-photo-points ride.gpx --originals ~/photos --outroot out/
```

`--overlay` leaves the route off the JPEG and writes it to `route.json`
instead. Without it you get a map with the route baked in, and this package
would draw it a second time.

`route.json` carries the map's pixel space and Mercator bounds, the polylines
banded by gradient, a thinned lookup table for the cursor, the places the
write-up names, and the profile's own coordinate system. `photos.json` carries
one distance per photograph, which is the only position it stores - both this
map and a 3D flyover derive their own coordinates from that same number, so the
two can never disagree about where a photograph was taken.

## What it does not do

- **No tiles.** It draws over a picture you already have. Fetching and stitching
  tiles is `gpx-mapgen`'s job, and it happens once at build time rather than in
  every reader's browser.
- **No panning or zooming.** This is a figure in a piece of writing, not a map
  application. It is one fixed view, chosen to fit the ride.
- **No bilingual chrome.** There is no text in the figure that this package
  writes, apart from the place names in the legend, which come from your data
  already in whatever language you wrote them.

## Styling

`route-map/styles.css` is the whole of it. Two things are worth knowing:

- The frame's rounding and shadow are set on `.route-map-frame`. Override that
  rule if your site dresses its figures differently.
- The legend's dark variant keys on a `.dark` class on an ancestor, which is the
  class-based dark mode most static sites use. Restate those three rules if
  yours toggles a data attribute instead.
- The legend names each marker's category for a screen reader, in a
  `.route-map-sr` span. If your site already has a visually-hidden utility, the
  package's rule is doing the same job and can be overridden away.

## Development

```bash
npm install
npm test           # vitest, against happy-dom
npm run typecheck
npm run build      # tsc, plus the stylesheet
```

The suite is 80 tests over four files: the cursor maths, the marker placement,
the markup builder, and the client wired up over markup the builder produced.
The fixtures are a real `route.json` and `photos.json` from a 45 km ride, so
what the tests read is a file the tool actually wrote.

This package was extracted from a working site, and the extraction was checked
rather than assumed: for a 45 km day ride and a 1,000 km tour, the overlay, the
legend and the hover payload it produces are byte-identical to what that site's
own component rendered - down to 29 photo dots merged from 108 photographs, and
a hover table thinned from 3,827 samples to 795.

happy-dom lays nothing out, so the client tests stub `getBoundingClientRect`
with the geometry a browser would report. That is the only thing the cursor
arithmetic needs from a layout engine. What it cannot cover - that the preview
lands somewhere clear of the route once the picture has decoded, that a finger
drag scrubs rather than navigates - needs a real browser, and stays the job of
the end-to-end specs in the site that uses this.

## Releases

A release is a pushed tag, and nothing is published to npm. `npm install
github:…#vX.Y.Z` clones the tag and runs `prepare`, which builds the package -
so the tag is the artefact and `dist/` never needs to be committed.

```bash
# Set the version in package.json first, then tag it.
git tag -a v1.1.0 --cleanup=verbatim -F notes.md
git push origin v1.1.0
```

npm resolves a `github:` ref through its cache, so bumping a tag alone can
reinstall the old commit. Check `node_modules/route-map`'s version after an
install, and force it with `rm -rf node_modules/route-map && npm install` if it
has not moved.

## Licence

MIT. See [LICENSE](LICENSE).
