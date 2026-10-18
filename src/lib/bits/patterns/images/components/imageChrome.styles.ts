// BITS
import { cx } from '#lib/bits/utils.js'

export const IMAGE_CHROME_SURFACE_CLASSES =
  'rounded-full border border-border bg-panel text-base-content shadow-sm'

export const IMAGE_METADATA_BUTTON_CLASSES = cx(
  IMAGE_CHROME_SURFACE_CLASSES,
  'inline-flex h-11 w-11 items-center justify-center transition hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
)

export const IMAGE_ATTRIBUTION_CLASSES = cx(
  '[--bits-feature-attribution-body-bg:var(--color-panel)]',
  '[--bits-feature-attribution-body-border:var(--color-border)]',
  '[--bits-feature-attribution-body-shadow:var(--shadow-sm)]',
  'text-base-content',
)
