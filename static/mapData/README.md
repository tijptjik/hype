# MTR entrances

`mtr-entrances.geojson` is derived from the local Hong Kong OpenStreetMap extract
`refresh-hk-2026-10-01.osm.pbf`. It contains 648 subway entrance points, of which
624 have current exit references. OSM IDs are retained for traceability. Blank
references are deliberate; `was:ref` is never substituted for a current reference.

© OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright).
This derived entrance database is available under ODbL 1.0. It supplements the
basemap because the current vector tiles omit entrance `ref` tags.

Regenerate from a newer Hong Kong OSM extract with:

```sh
python3 scripts/maps/build-mtr-entrances.py /path/to/hong-kong.osm.pbf
```

The MTR sprite at `../mapSprites/breadline-light/exit.svg` uses the MTR identifier
from [HK MTR logo.svg](https://en.wikipedia.org/wiki/File:HK_MTR_logo.svg), with a
paper-coloured outline added for contrast. The symbol identifies railway access;
it does not imply affiliation. PNG sprite assets are rendered from that SVG at
1× and 2× resolution.

## Building and shopping-landmark labels

`building-labels.geojson` uses the same 2026-10-01 Hong Kong OSM extract and ODbL
terms above. It contains 35,383 named point features, including 590 shopping malls
and department stores. Polygon labels use an interior representative point;
source OSM type/IDs and available English/Chinese names are retained. Plain house
numbers and duplicate mall/containing-building labels are excluded. It is a
static snapshot and must be refreshed with the source extract.

```sh
python3 scripts/maps/build-building-labels.py /path/to/hong-kong.osm.pbf
```

The generator requires `osmium` and Python `shapely`. The uncompressed point
collection is approximately 7.5 MB (about 1.1 MB with gzip); no building outlines
are shipped in this supplementary layer.
