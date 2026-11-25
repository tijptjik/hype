# URA/KC-017 interior maps

On 25 November 2026, Hype published ten historical building interiors covering 96 levels
and 1,955 areas. The production catalogue serves the map data for mobile integration.
The accompanying viewer changes are pending a frontend deployment.
[Production catalogue](https://hype.hk/api/premises-maps) ·
[Release manifest](publication.json)

| Building               | Levels | Areas | Links                                                                                                                                                                                                                                                                                                           |
| ---------------------- | -----: | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17 Kai Tak Road        |      8 |    50 | [Viewer](https://hype.hk/buildings/building-building-4e231fde35f89c933f80a1b2d633816983af72027b0b512a6cf419ad8c998-2de61e50) · [API](https://hype.hk/api/premises-maps/building-building-4e231fde35f89c933f80a1b2d633816983af72027b0b512a6cf419ad8c998-2de61e50) · [Extraction](extractions/ktr-17.json)        |
| Wing Shing House       |     11 |   200 | [Viewer](https://hype.hk/buildings/building-building-33416288e9a3ec8d6459b9d3c85f64e80cb847a37c4f9fb75fe25264a5954-6f62bbf0) · [API](https://hype.hk/api/premises-maps/building-building-33416288e9a3ec8d6459b9d3c85f64e80cb847a37c4f9fb75fe25264a5954-6f62bbf0) · [Extraction](extractions/ktr-19-21.json)     |
| 25–31A Kai Tak Road    |     10 |   322 | [Viewer](https://hype.hk/buildings/building-ea6qom6lemvr-9d5dd3d8) · [API](https://hype.hk/api/premises-maps/building-ea6qom6lemvr-9d5dd3d8) · [Extraction](extractions/ktr-23-29.json)                                                                                                                         |
| 31-41 Kai Tak Road     |     13 |   524 | [Viewer](https://hype.hk/buildings/building-0wzvoltsnvg8-fe6294fc) · [API](https://hype.hk/api/premises-maps/building-0wzvoltsnvg8-fe6294fc) · [Extraction](extractions/ktr-31-41.json)                                                                                                                         |
| Nga Tsin Wai Building  |     10 |   343 | [Viewer](https://hype.hk/buildings/building-building-5ae946e9fd041cbe0d7bccb43b668180039afa8fbd8f0e62f03d2832fc611-bf64f2d0) · [API](https://hype.hk/api/premises-maps/building-building-5ae946e9fd041cbe0d7bccb43b668180039afa8fbd8f0e62f03d2832fc611-bf64f2d0) · [Extraction](extractions/ntwr-32-38.json)    |
| Luen Fat Building      |      9 |   133 | [Viewer](https://hype.hk/buildings/building-building-47caf70cb2f33863436d5d5c0082c1988457fa63385bc17d29a561b797da3-f29ec656) · [API](https://hype.hk/api/premises-maps/building-building-47caf70cb2f33863436d5d5c0082c1988457fa63385bc17d29a561b797da3-f29ec656) · [Extraction](extractions/tklr-26-28.json)    |
| 30 Tak Ku Ling Road    |      9 |    53 | [Viewer](https://hype.hk/buildings/building-building-aae68b97ccfcac0a2ecf3c0cbbbcaa58f6ef5169659b13adb2987811d2108-646eaba1) · [API](https://hype.hk/api/premises-maps/building-building-aae68b97ccfcac0a2ecf3c0cbbbcaa58f6ef5169659b13adb2987811d2108-646eaba1) · [Extraction](extractions/tklr-30.json)       |
| Tat Tak Building       |      9 |   102 | [Viewer](https://hype.hk/buildings/building-building-64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1-2d051a82) · [API](https://hype.hk/api/premises-maps/building-building-64b6bf79777a8eca00646a058d7286120ce2714e1e21805306468a59f97a1-2d051a82) · [Extraction](extractions/tklr-32-34a.json)   |
| 36–38 Tak Ku Ling Road |      9 |   135 | [Viewer](https://hype.hk/buildings/building-t6qibrppuk0w-420336b8) · [API](https://hype.hk/api/premises-maps/building-t6qibrppuk0w-420336b8) · [Extraction](extractions/tklr-36-38.json)                                                                                                                        |
| South Mansion          |      8 |    93 | [Viewer](https://hype.hk/buildings/building-building-b9d25941b52020c0e9a8ecd4771ff342d1e1cd0dfa5d66c6a68596bfae23b-5b0dfe9b) · [API](https://hype.hk/api/premises-maps/building-building-b9d25941b52020c0e9a8ecd4771ff342d1e1cd0dfa5d66c6a68596bfae23b-5b0dfe9b) · [Extraction](extractions/south-mansion.json) |

## Use a published map

Fetch the building's API link to resolve its current release. Fetch the returned bundle
URL from the same origin. The manifest records the SHA-256 hash of each bundle published
on 25 November. The bundle carries the canonical building-part Location IDs, floor
associations and map geometry.

## Review and reproduce a floor

Each extraction contains the published review geometry for the listed release, with
outlines, holes, room categories, evidence and confidence in source-crop pixels. A
floor's `page` identifies its registered crop. Repeated typical floors have distinct
floor IDs and share their crop. Unit references, stair flights and alignment are
retained where the source supported them. Database record IDs are available through the
released bundle.

The authorised building review job retains the original plan crop and cleaned image. Its
editable polygons form the third comparison stage. The local research package also keeps
a raster overlay for visual comparison. Staff can retrieve the protected images from the
building's interior editor. For a local reconstruction, load the corresponding
extraction through the floor-plan schema, run the geometry audit and convert it to a map
with `floorplanBundle`. Producing a linked release also requires the canonical building
and floor/area Location associations.
[Extraction and conversion](../../../src/lib/indoor/floorplans/extraction.ts) ·
[Geometry audit](../../../src/lib/indoor/floorplans/review.ts)

## Source qualifications

- The local URA/KC-017 session also has a provisional outline for Kai King Mansion,
  57–59 Lung Kong Road. Each of its seven levels uses the Lands Department tower
  footprint, BuildingCSUID `3764621208T20050430`. The saved façade alignment places the
  mezzanine between G/F and 1/F and ends at 5/F. Each level accepts an XY pin within the
  same boundary and has zero mapped units.
  [Kai King Mansion extraction](extractions/kai-king-mansion.json)
- The plans record historical approved configurations. The combined drawings for 23–29
  Kai Tak Road meet at the party wall between Nos. 25 and 27. Their research-session
  building is labelled 25–31A Kai Tak Road. A 1971 restaurant alteration spans Nos.
  25–33 on the lower levels and crosses into the neighbouring 31–41 Kai Tak Road
  building.
- Wing Shing House has ten unclassified polygons. The combined Kai Tak plan has
  eighteen. These include interstitial spaces and unresolved linework. Luen Fat Building
  has ten unclassified service-recess polygons. Its permit describes two flats and one
  tenement on each residential floor, while its typical drawing labels three domestic
  spaces A, B and C.
- The upper-floor labels for 36–38 Tak Ku Ling Road follow the sides of the two numbered
  ground-floor shopfronts. The residential drawings have no flat letters.
