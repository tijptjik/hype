# Feature Card Content Layout Design Spec

## Summary

This spec defines the intended layout behaviour for
`src/lib/bits/patterns/cards/featureCard/components/FeatureCardContent.svelte`.

The content area is composed from three moving parts:

- the portal on the right
- the optional description text
- the optional feature-property grid

The layout must be deterministic and case-driven rather than heuristic. The collapsed
state should make it obvious why content appears above the portal, adjacent to the portal,
or below the portal.

## Shared Rules

- If there is no description and no fields, render only the portal.
- The portal remains anchored on the right.
- The region to the left of the portal is the adjacent content region.
- The region below the portal is the overflow content region.
- Description text is routed with Pretext around both:
  - the portal obstacle
  - the `Read More` / `Read Less` button obstacle when present
- The collapsed `Read More` button and expanded `Read Less` button:
  - must not wrap
  - must stay at the top-right
  - must use the same anchored position in collapsed and expanded states
- In expanded mode, the button remains visually sticky while text scrolls beneath it.
- At most two description lines may appear above the top of the portal.
- A collapsed long-description layout must show at least two visible description lines.

## Layout Definitions

### Adjacent Field Region

The adjacent field region is the column to the left of the portal.

- With no description, fields in this region are top-aligned to the top of the portal.
- With a description, fields in this region are bottom-aligned to the bottom of the portal.
- Fields should remain adjacent to the portal where possible.
- If not all fields fit in the adjacent region, remaining fields continue in the overflow
  region below the portal at full available width.

### Short Description

A description is considered short when the collapsed composition can show the full
description and the applicable field layout without pushing content below the bottom of the
portal.

This definition includes fields:

- if there are no fields, the description alone must finish at or above the portal bottom
- if there are fields, the combined description plus adjacent field composition must finish
  at or above the portal bottom

### Long Description

A description is considered long when the collapsed composition would otherwise push
content below the bottom of the portal.

In this case:

- fields are prioritized in the adjacent field region
- only the remaining collapsed height budget above the portal bottom is available for text
- the description is truncated in collapsed mode
- the `Read More` button is shown

## Required Cases

### Case 1: No Fields, No Description

- Show only the portal.

### Case 2: Some Fields, No Description

- Start the field grid adjacent to the portal.
- Top-align the adjacent field block to the top of the portal.
- If all fields fit adjacent to the portal, stop there.

### Case 3: Many Fields, No Description

- Same as Case 2 for the adjacent field region.
- Any additional rows that do not fit adjacent to the portal continue below the portal in a
  full-width grid.

### Case 4: No Fields, Short Description

- Show the full description with Pretext layout.
- Do not show a toggle.
- Do not force additional spacing or truncation.

### Case 5: Some Fields, Short Description

- Show the full description with Pretext layout.
- Lay out fields immediately after the description.
- Allow the adjacent field block to move upward as needed, but never above the top of the
  portal.
- If the description uses less than the space above the portal, fields should occupy the
  newly available adjacent area.
- Do not show a toggle.

### Case 6: Any Number of Fields, Long Description

- First compute the adjacent field layout to determine how much of the portal-height column
  is consumed.
- Keep fields adjacent to the portal where possible and bottom-align that adjacent block to
  the bottom of the portal.
- Any remaining fields flow below the portal in a full-width grid.
- Use the remaining collapsed vertical budget for the description.
- Route collapsed text around the top-right toggle and the portal.
- Ensure at least two description lines remain visible in collapsed mode.
- Show `Read More`.

## Expanded Mode

- Expanded text remains routed around the portal and the sticky top-right `Read Less`
  button.
- The button should stay anchored and not jump when the user expands.
- The text viewport scrolls independently under the sticky button.
- The expanded starting scroll position should preserve continuity with the collapsed text
  reveal.

## Implementation Notes

- The layout engine should prefer explicit intermediate measurements over implicit visual
  guesses.
- Property placement should be derived from measured adjacent-region and overflow-region
  widths and heights.
- The collapsed short/long decision should come from measured layout output, not from raw
  character count or a fixed description line budget alone.
