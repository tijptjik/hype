// TYPES
import type { OmniSearchCollection } from '#lib/context/omni.types.js'

/** Ordered preview quotas; lower priorities receive only the space left by earlier ones. */
export const OMNIBAR_SEARCH_POLICY = [
  { type: 'feature', limit: 5 },
  { type: 'walk', limit: 2 },
  { type: 'project', limit: 2 },
  { type: 'layer', limit: 2 },
  { type: 'neighbourhood', limit: 2 },
  { type: 'organisation', limit: 2 },
] as const satisfies ReadonlyArray<{ type: OmniSearchCollection; limit: number }>

export const OMNIBAR_SEARCH_VIEWPORT_FRACTION = 0.6

/**
 * Caps the entire tray against both the visible viewport and the room beneath the input.
 * @param viewportHeight Visual viewport height, excluding the mobile keyboard.
 * @param availableBelow Space from the tray top to the unobscured bottom gutter.
 * @returns Non-negative pixel budget, without a minimum that could overlap the keyboard.
 */
export function getSearchTrayHeight(
  viewportHeight: number,
  availableBelow: number,
): number {
  return Math.max(
    0,
    Math.min(viewportHeight * OMNIBAR_SEARCH_VIEWPORT_FRACTION, availableBelow),
  )
}

export type SearchSectionMeasurement = {
  chrome: number
  rows: readonly number[]
}

/**
 * Allocates measured rows in priority order, charging each visible category's header once.
 * @param sections Measurements in policy order, already limited to each preview quota.
 * @param budget Available results height after reserving the footer and tray borders.
 * @returns Visible row counts, with no orphan category headers.
 * @remarks A single oversized first result remains scrollable rather than hiding every match.
 * Expanded categories bypass this preview allocator but retain the same tray height cap.
 */
export function allocateSearchRows(
  sections: readonly SearchSectionMeasurement[],
  budget: number,
): number[] {
  const counts = sections.map(() => 0)
  if (budget <= 0) return counts
  let remaining = budget
  let shown = false
  for (const [index, section] of sections.entries()) {
    for (const [rowIndex, height] of section.rows.entries()) {
      const cost = height + (rowIndex === 0 ? section.chrome : 0)
      if (cost > remaining) {
        if (!shown) counts[index] = 1
        return counts
      }
      counts[index]++
      remaining -= cost
      shown = true
    }
  }
  return counts
}
