import { ADMIN_MIN_WIDTH, MOBILE_MAX_WIDTH } from '$lib/constants'

export const APP_MENU_COMPACT_MAX_WIDTH = 520
export const APP_MENU_ULTRA_NARROW_MAX_WIDTH = 400
export const APP_MENU_COMPACT_MAX_HEIGHT = 560

/**
 * Returns the width threshold used by `Button` to auto-hide labels in the app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @returns A pixel threshold for `hideLabelBelow`, or `0` to disable auto-hiding.
 */
export function getAppMenuHideLabelBelow(availableWidth: number): number {
  return availableWidth >= MOBILE_MAX_WIDTH ? ADMIN_MIN_WIDTH : 0
}

/**
 * Returns whether the app menu should switch to its compact mobile layout.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @returns `true` when the viewport is too constrained for the default mobile layout.
 */
export function isCompactAppMenuViewport(
  availableWidth: number,
  availableHeight: number,
): boolean {
  return (
    (availableWidth > 0 &&
      availableWidth < APP_MENU_COMPACT_MAX_WIDTH &&
      (availableHeight < APP_MENU_COMPACT_MAX_HEIGHT ||
        availableWidth < APP_MENU_ULTRA_NARROW_MAX_WIDTH)) ||
    (availableHeight > 0 && availableHeight < APP_MENU_COMPACT_MAX_HEIGHT)
  )
}

export function isMobile(availableWidth: number) {
  return availableWidth < MOBILE_MAX_WIDTH
}
