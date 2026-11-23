# Kowloon Tong Exit B verification

Checked on 2026-11-16 against the locally published map and MTR's current official
[station layout](https://www.mtr.com.hk/archive/en/services/layouts/kot.pdf). The
downloaded layout is byte-identical to our retained copy (SHA-256
`517ac9da4a3a7bc8c269d759b16e2689e57968d285a888613c5fd65bcea73ea4`).

[Review the map](http://localhost:4173/admin/premises-maps?map=kowloon-tong-mtr).

## Confirmed

The source level `d6e6d0d5-0ade-4999-9cb8-6f9166f92fcd` is Exit B access, not a railway
platform. Its published English label is **Exit B Staircase**. The source records it at
elevation 19.1 m and marks all three constituent units as unpaid area. From the eastern
street entrance toward the west, they are:

| Element                  | Source unit ID                         |
| ------------------------ | -------------------------------------- |
| Entrance steps           | `4ac01c34-9a81-43bc-8dc5-0d45110e22a6` |
| Short corridor / landing | `39c0ad1a-cac2-4a96-b0c1-f3edeab3d733` |
| Main staircase           | `cbbc6c19-2886-4c53-893c-59a6ad00b4d9` |

The eastern boundary of the steps contains principal opening
`59a9bd6c-fa99-43fc-9543-94361a99996f` and the explicit Exit B amenity
`3be2e9fd-d0d8-4f8e-9157-6f9d8b043240`. Pedestrian openings
`c1b9c096-3bb4-4344-abfa-42ed5683c923` and `8791fd5b-e02a-418e-9468-3a3a9a8b1cb7` join
the three adjacent polygons. Thus the street entrance is on the east side; the main
stair continues westward away from that entrance. Calling the whole level a landing
would omit its main staircase, although its small corridor can be described as a
landing.

MTR's layout places Exit B on the unpaid concourse access route. Its street map places
the entrance on Suffolk Road. Neither document identifies source polygon IDs or supplies
a surveyed lower stair endpoint.

## Cross-level endpoint remains unresolved

Concourse level `02debe2d-64b7-4b1d-9797-b73ec3a76dc9` is recorded at 12.04 m. The
western end midpoint of the main stair is approximately `114.17643546, 22.33698331`.
Projecting that point onto the concourse geometry:

- It falls inside corridor `0568f83a-db07-438c-9263-73dcf1c7e191`, which the source
  marks **paid area**.
- The nearby unpaid corridor `35a376cf-0ea8-4520-9ec9-82007de477bc` is about 5.7 m away
  at its nearest boundary.
- There is no aligned lower stair polygon or matching cross-level endpoint.

The published bundle `903df6071392764abea5c0353791a35242c65875942c1352d0a7c001386f0e0a`
contains 12 saved connections; none touches this level. The saved connection corrections
likewise contain no Exit B link. This is a missing verified link, not evidence that the
staircase connects to the East Rail platform merely because both have a recorded
elevation of 19.1 m.

Do not create a connection to the nearest polygon or treat the projected paid corridor
as the destination. A detailed lower-concourse plan or an on-site check is needed to
identify the actual arrival polygon and entrance side. Then save that explicit
connection as a persistent map correction and publish the prepared resource. No
connection or publication was changed during this verification.

The published source-derived Chinese level label (`月台`) and short label (`P`) still
say platform. These should be corrected along with the English label in a separate
publication; this verification did not alter label data.
