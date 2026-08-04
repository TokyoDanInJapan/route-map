# Security

## Reporting something

Use **[Report a vulnerability](https://github.com/TokyoDanInJapan/route-map/security/advisories/new)** on the
Security tab. That is private: it opens an advisory only you and the maintainer can see, so a problem can be
fixed before it is described in public.

If that page is unavailable to you, open an ordinary issue saying only that you have something to report and
asking for a private channel. Do not put the details in it - a public issue discloses the problem in the act
of reporting it.

Expect an acknowledgement within a week. This is a small library maintained by one person, so a fix may take
longer than that; you will be told either way rather than left waiting.

## What is supported

The latest patch version, currently `1.0.x`. Older versions are not patched. Consumers pin a tag in their
dependency specifier, so upgrading is a one-line change - see the release notes for anything that changed.

## What this package does with input

It takes JSON written by [gpx-tools](https://github.com/TokyoDanInJapan/gpx-tools) and turns it into markup.
Two things follow from that, and both are worth knowing before reporting or reviewing:

- **`renderRouteMap` builds HTML from your data.** Place names, captions and links come out of a write-up and
  are escaped as text and as attribute values, with a test for each. If you can get markup through it, that
  is a vulnerability - please report it.
- **The published page runs no code from the data.** The client half reads an inert JSON block and sets
  attributes; it never evaluates anything out of it, and it fetches nothing but the thumbnail a reader points
  at.

The package has no runtime dependencies, so there is no supply chain below it to compromise.
