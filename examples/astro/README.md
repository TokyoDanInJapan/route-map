# The Astro half

Two components, to copy into a site rather than install. They are short on
purpose: everything in them is something the package deliberately does not know.

| what stays here | why |
| --- | --- |
| `getEntry('galleries', …)` | the collection's name is the site's |
| `getImage({ width: 300 })` | which sizes exist is the site's image pipeline |
| the alt-text fallback | what an uncaptioned photograph is called is editorial |
| `<Image>` for the tiles | the site decides how its images are served |
| `astro:page-load` | when to re-wire is the router's business, not the map's |

Everything else - the route, the markers, the legend, the cursor, the photo
preview - comes from the package.

## Installing

```bash
npm install github:TokyoDanInJapan/route-map#v1.0.0
```

Then copy `RouteMap.astro` and `ElevationChart.astro` into your components
directory. The stylesheet is imported by `RouteMap.astro`, so nothing else needs
to know about it.

## The data

Both files come from [gpx-tools](https://github.com/TokyoDanInJapan/gpx-tools):

```bash
gpx-mapgen ride.gpx --outdir out/ --post ride.mdx --overlay   # map.jpg, route.json, elevation.svg
gpx-photo-points ride.gpx --originals ~/photos --outroot out/ # photos.json
```

`--overlay` is not optional if you use these components. Without it the route is
baked into `map.jpg`, and the page would draw it twice.
