import { MOBILE_MAX_WIDTH } from '$lib/constants'

export const APP_MENU_COMPACT_MAX_WIDTH = 520
export const APP_MENU_ULTRA_NARROW_MAX_WIDTH = 400
export const APP_MENU_COMPACT_MAX_HEIGHT = 800
export const APP_MENU_HIDE_LABELS_MIN_WIDTH = 768
export const APP_MENU_HIDE_LABELS_MAX_WIDTH = 1280
export const APP_MENU_HIDE_LABELS_SHORT_HEIGHT = 800
export const APP_MENU_HIDE_LABELS_NARROW_WIDTH = APP_MENU_COMPACT_MAX_WIDTH
export const APP_MENU_COMPACT_EFFECTIVE_BOTTOM_OFFSET = 58
export const APP_MENU_DEFAULT_EFFECTIVE_BOTTOM_OFFSET = 80

/**
 * Returns the visual clearance height occupied by the app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @returns Menu clearance height in pixels.
 */
export function getMenuClearanceHeight(
  availableWidth: number,
  availableHeight: number,
): number {
  return getAppMenuViewportState(availableWidth, availableHeight).effectiveBottomOffset
}

/**
 * Returns the flow height reserved exclusively for the mobile app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @returns Reserved menu height in pixels, or 0 when the desktop menu overlays content.
 */
export function getMenuReservedHeight(
  availableWidth: number,
  availableHeight: number,
): number {
  const viewportState = getAppMenuViewportState(availableWidth, availableHeight)

  if (!viewportState.isMobileMenu) {
    return 0
  }

  return viewportState.shouldUseCompactVisualMenu
    ? APP_MENU_COMPACT_EFFECTIVE_BOTTOM_OFFSET
    : APP_MENU_DEFAULT_EFFECTIVE_BOTTOM_OFFSET
}

/**
 * Returns the responsive layout state needed to render the app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @returns Derived menu state for label visibility, compact layout, and offsets.
 */
export function getAppMenuViewportState(
  availableWidth: number,
  availableHeight: number,
): {
  effectiveBottomOffset: number
  isCompactMobileMenu: boolean
  isIconOnlyMenu: boolean
  isMobileMenu: boolean
  shouldUseCompactVisualMenu: boolean
} {
  const isMobileMenu = availableWidth < MOBILE_MAX_WIDTH
  const isCompactMobileMenu =
    (availableWidth > 0 &&
      availableWidth < APP_MENU_COMPACT_MAX_WIDTH &&
      (availableHeight < APP_MENU_COMPACT_MAX_HEIGHT ||
        availableWidth < APP_MENU_ULTRA_NARROW_MAX_WIDTH)) ||
    (availableHeight > 0 && availableHeight < APP_MENU_COMPACT_MAX_HEIGHT)
  const hideLabels =
    (availableHeight > 0 && availableHeight < APP_MENU_HIDE_LABELS_SHORT_HEIGHT) ||
    (availableWidth > 0 && availableWidth < APP_MENU_HIDE_LABELS_NARROW_WIDTH) ||
    (availableWidth > APP_MENU_HIDE_LABELS_MIN_WIDTH &&
      availableWidth < APP_MENU_HIDE_LABELS_MAX_WIDTH)
  const shouldUseCompactVisualMenu =
    isCompactMobileMenu ||
    (hideLabels && availableWidth > 0 && availableWidth < APP_MENU_COMPACT_MAX_WIDTH)
  const effectiveBottomOffset = shouldUseCompactVisualMenu
    ? APP_MENU_COMPACT_EFFECTIVE_BOTTOM_OFFSET
    : APP_MENU_DEFAULT_EFFECTIVE_BOTTOM_OFFSET

  return {
    effectiveBottomOffset,
    isCompactMobileMenu,
    isIconOnlyMenu: isCompactMobileMenu || hideLabels,
    isMobileMenu,
    shouldUseCompactVisualMenu,
  }
}
