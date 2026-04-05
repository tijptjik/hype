// CONTEXT
import { hasElevatedChrome } from '$lib/context/responsive.svelte'

const OMNIBAR_STANDARD_BAR_HEIGHT_PX = 56
const ELEVATED_CHROME_NARROW_X_GUTTER_PX = 16
const ELEVATED_CHROME_WIDE_X_GUTTER_PX = 24
const ELEVATED_CHROME_WIDE_GUTTER_MIN_WIDTH_PX = 758
const OMNIBAR_WIDE_DESKTOP_LAYOUT_MIN_WIDTH_PX = 1280
const OMNIBAR_TALL_WIDE_DESKTOP_MIN_HEIGHT_PX = 1200
const OMNIBAR_TALL_WIDE_DESKTOP_TOP_GUTTER_PX = 48

/**
 * Returns the shared elevated chrome horizontal gutter.
 *
 * @param width Current viewport width in pixels.
 * @returns Elevated chrome horizontal gutter in pixels.
 */
export function getElevatedChromeXGutter(width: number): number {
  return width < ELEVATED_CHROME_WIDE_GUTTER_MIN_WIDTH_PX
    ? ELEVATED_CHROME_NARROW_X_GUTTER_PX
    : ELEVATED_CHROME_WIDE_X_GUTTER_PX
}

/**
 * Returns the top gutter used above the omnibar in elevated chrome.
 *
 * @param width Current viewport width in pixels.
 * @param height Current viewport height in pixels.
 * @returns Omnibar top gutter in pixels.
 */
export function getOmnibarTopGutter(width: number, height: number): number {
  if (
    width >= OMNIBAR_WIDE_DESKTOP_LAYOUT_MIN_WIDTH_PX &&
    height > OMNIBAR_TALL_WIDE_DESKTOP_MIN_HEIGHT_PX
  ) {
    return OMNIBAR_TALL_WIDE_DESKTOP_TOP_GUTTER_PX
  }

  return getElevatedChromeXGutter(width)
}

/**
 * Returns the vertical clearance occupied by the omnibar in the app layout.
 *
 * @param width Current viewport width in pixels.
 * @param height Current viewport height in pixels.
 * @returns Omnibar clearance height in pixels.
 */
export function getOmnibarClearanceHeight(width: number, height: number): number {
  if (!hasElevatedChrome(width, height)) {
    return OMNIBAR_STANDARD_BAR_HEIGHT_PX
  }

  return (
    OMNIBAR_STANDARD_BAR_HEIGHT_PX +
    getOmnibarTopGutter(width, height) +
    getElevatedChromeXGutter(width)
  )
}
