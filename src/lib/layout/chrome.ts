const ELEVATED_CHROME_MIN_WIDTH_PX = 480
const ELEVATED_CHROME_WIDE_VIEWPORT_MIN_WIDTH_PX = 768
const ELEVATED_CHROME_MIN_HEIGHT_PX = 800
const ELEVATED_CHROME_EXTRA_REQUIRED_HEIGHT_PX = 40
const ELEVATED_CHROME_DESKTOP_WIDE_EXTRA_REQUIRED_HEIGHT_PX = 48
const ELEVATED_CHROME_DESKTOP_WIDE_MIN_WIDTH_PX = 1280

/**
 * Returns the minimum viewport height required before elevated chrome is safe.
 *
 * @param width Current viewport width in pixels.
 * @returns Minimum height in pixels needed for elevated chrome.
 */
export function getElevatedChromeMinHeight(width: number): number {
  return width >= ELEVATED_CHROME_DESKTOP_WIDE_MIN_WIDTH_PX
    ? ELEVATED_CHROME_MIN_HEIGHT_PX +
        ELEVATED_CHROME_DESKTOP_WIDE_EXTRA_REQUIRED_HEIGHT_PX
    : ELEVATED_CHROME_MIN_HEIGHT_PX + ELEVATED_CHROME_EXTRA_REQUIRED_HEIGHT_PX
}

/** Determines whether chrome can float. @param width Available width. @param height Available height. @returns Whether elevated chrome fits. */
export function hasElevatedChrome(width: number, height: number): boolean {
  return (
    width >= ELEVATED_CHROME_WIDE_VIEWPORT_MIN_WIDTH_PX ||
    (width >= ELEVATED_CHROME_MIN_WIDTH_PX &&
      height >= getElevatedChromeMinHeight(width))
  )
}
