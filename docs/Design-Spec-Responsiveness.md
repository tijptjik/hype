# Design Spec: Feature Card Responsiveness

## Goal

This spec defines the current responsive contract for the feature card shell and its immediate children while the remaining legacy internals are being ported into `src/lib/bits/patterns/cards/featureCard`.

## Ownership

- Page/layout code should own the viewport budget when possible.
- `FeatureCardRoot` therefore accepts an optional `heightBudgetPx` prop.
- If `heightBudgetPx` is omitted, the feature card falls back to a viewport-derived max height using the app-menu footprint and safe-area inset.
- Longer term, the preferred flow is:
  1. page/layout computes available card height
  2. page passes `heightBudgetPx`
  3. feature-card internals adapt viewer/description/field allocation within that budget

## Responsive Modes

- `tiny`: `height < 800px` or `width < 400px`
- `small`: `height >= 800px` and `400px <= width < 480px`
- `smallWide`: `height >= 800px` and `480px <= width < 768px`
- `desktop`: `height >= 800px` and `768px <= width < 1280px`
- `desktopWide`: `height >= 800px` and `width >= 1280px`

## Shell Rules

### Tiny

- Card is edge-to-edge.
- No extra gap between omnibar/app menu and card.
- Outer shell keeps the 8px black border and stays transparent.
- No outer rounding or glow.
- Container is rounded on the top edge and scrollable.
- Actions stay visible below the scroll container.
- Viewer padding is `0`.

### Small

- Card remains edge-to-edge.
- Container is not scrollable.
- Viewer minimum height is `300px`.
- Content must fit the available height budget except for explicit internal overflow areas such as expanded description.

### Wider Small

- Card gains `16px` horizontal inset.
- Top offset is `8px`.
- Container remains non-scrollable.

### Desktop

- Card width caps at `736px`.
- Card gains `16px` horizontal inset.
- Top offset is `16px`.
- Elevated chrome and wide rounding are enabled.

### Wide Desktop

- Card width caps at `1024px`.
- Desktop chrome rules remain in effect.

## App Menu Rules

- Labels are hidden when:
  - `height < 800px`
  - `width < 520px`
  - `768px < width < 1280px`
- Desktop pill positioning reserves `80px` total bottom clearance.

## Spacing Tokens

These are exposed as CSS custom properties by `FeatureCardRoot`.

- `--feature-card-viewer-padding`
- `--feature-card-breadcrumbs-padding`
- `--feature-card-content-padding`
- `--feature-card-content-gap`

Current values:

- Viewer padding: `0px` on `tiny`, `6px` otherwise
- Breadcrumbs x padding: `6px` on `tiny`, `12px` otherwise
- Content x padding: `6px`
- Content gap: `8px`

## Current Port Scope

The Bits layer now owns:

- root shell
- container/scroll behavior
- actions shell
- breadcrumbs shell
- viewer spacing/min-height contract

The following still rely on legacy internals and should be ported next:

- title
- landscape/content split
- portal/address extraction
- text/field balancing against a supplied height budget

## Open Follow-Up

- Move portal centering away from DOM lookups and onto an explicit `flyTo(offset)` callback contract.
- Replace legacy `FeatureInfoLandscape` with Bits subcomponents for `PortalLayer`, `Address`, `Description`, and `Fields`.
- Push final height-budget calculation fully to page/layout once omnibar and app-menu offsets are surfaced as stable inputs.
