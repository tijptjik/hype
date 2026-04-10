import { hasElevatedChrome as getHasElevatedChrome } from '$lib/context/responsive.svelte'
import { getElevatedChromeXGutter } from '$lib/bits/patterns/bars/omnibar/Omnibar.layout'
import { MOBILE_MAX_WIDTH } from '$lib/constants'

export type AppMenuLayoutMode =
  | 'shortMenu'
  | 'tallMenu'
  | 'narrowPillMenu'
  | 'widePillMenu'

export const APP_MENU_LAYOUT_COMPACT_MAX_WIDTH = 520
export const APP_MENU_LAYOUT_COMPACT_TALL_MIN_HEIGHT = 1024
export const APP_MENU_LAYOUT_MEDIUM_MIN_WIDTH = 768
export const APP_MENU_LAYOUT_WIDE_MIN_WIDTH = 1200
export const APP_MENU_LAYOUT_TALL_MIN_HEIGHT = 840
export const APP_MENU_COMPACT_EFFECTIVE_BOTTOM_OFFSET = 58
export const APP_MENU_DEFAULT_EFFECTIVE_BOTTOM_OFFSET = 80

/**
 * Returns the gutter rendered beneath the pill menu in elevated chrome.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @param responsiveWidth Optional effective content width in pixels used for
 * width-based layout decisions when surrounding panels shrink the main area.
 * @returns Bottom gutter under the pill menu in pixels.
 */
export function getAppMenuBottomGutter(
  availableWidth: number,
  availableHeight: number,
  responsiveWidth?: number | null,
): number {
  const viewportState = getAppMenuViewportState(
    availableWidth,
    availableHeight,
    responsiveWidth,
  )

  return viewportState.hasElevatedChrome
    ? getElevatedChromeXGutter(responsiveWidth ?? availableWidth)
    : 0
}

/**
 * Returns the visual clearance height occupied by the app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @param responsiveWidth Optional effective content width in pixels used for
 * width-based layout decisions when surrounding panels shrink the main area.
 * @returns Menu clearance height in pixels.
 */
export function getMenuClearanceHeight(
  availableWidth: number,
  availableHeight: number,
  responsiveWidth?: number | null,
): number {
  return getAppMenuViewportState(availableWidth, availableHeight, responsiveWidth)
    .effectiveBottomOffset
}

/**
 * Returns the flow height reserved exclusively for the mobile app menu.
 *
 * @param availableWidth Current viewport width in pixels.
 * @param availableHeight Current viewport height in pixels.
 * @param responsiveWidth Optional effective content width in pixels used for
 * width-based layout decisions when surrounding panels shrink the main area.
 * @returns Reserved menu height in pixels, or 0 when the desktop menu overlays content.
 */
export function getMenuReservedHeight(
  availableWidth: number,
  availableHeight: number,
  responsiveWidth?: number | null,
): number {
  const viewportState = getAppMenuViewportState(
    availableWidth,
    availableHeight,
    responsiveWidth,
  )

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
 * @param responsiveWidth Optional effective content width in pixels used for
 * width-based layout decisions when surrounding panels shrink the main area.
 * @returns Derived menu state for label visibility, compact layout, and offsets.
 */
export function getAppMenuViewportState(
  availableWidth: number,
  availableHeight: number,
  responsiveWidth?: number | null,
): {
  effectiveBottomOffset: number
  hasElevatedChrome: boolean
  isCompactMobileMenu: boolean
  isIconOnlyMenu: boolean
  isMobileMenu: boolean
  menuMode: AppMenuLayoutMode
  shouldUseCompactVisualMenu: boolean
} {
  const effectiveWidth = responsiveWidth ?? availableWidth
  const hasElevatedChrome = getHasElevatedChrome(effectiveWidth, availableHeight)
  const isMobileMenu = effectiveWidth < MOBILE_MAX_WIDTH
  let menuMode: AppMenuLayoutMode = 'shortMenu'

  if (effectiveWidth < APP_MENU_LAYOUT_COMPACT_MAX_WIDTH) {
    menuMode =
      availableHeight >= APP_MENU_LAYOUT_COMPACT_TALL_MIN_HEIGHT
        ? 'tallMenu'
        : 'shortMenu'
  } else if (effectiveWidth < APP_MENU_LAYOUT_MEDIUM_MIN_WIDTH) {
    menuMode =
      availableHeight >= APP_MENU_LAYOUT_TALL_MIN_HEIGHT ? 'tallMenu' : 'shortMenu'
  } else if (effectiveWidth < APP_MENU_LAYOUT_WIDE_MIN_WIDTH) {
    menuMode =
      availableHeight >= APP_MENU_LAYOUT_TALL_MIN_HEIGHT
        ? 'narrowPillMenu'
        : 'shortMenu'
  } else {
    menuMode =
      availableHeight >= APP_MENU_LAYOUT_TALL_MIN_HEIGHT ? 'widePillMenu' : 'shortMenu'
  }

  const isCompactMobileMenu = isMobileMenu && menuMode === 'shortMenu'
  const isIconOnlyMenu = menuMode === 'shortMenu' || menuMode === 'narrowPillMenu'
  const shouldUseCompactVisualMenu = menuMode === 'shortMenu'
  const effectiveBottomOffset = shouldUseCompactVisualMenu
    ? APP_MENU_COMPACT_EFFECTIVE_BOTTOM_OFFSET
    : APP_MENU_DEFAULT_EFFECTIVE_BOTTOM_OFFSET

  return {
    effectiveBottomOffset,
    hasElevatedChrome,
    isCompactMobileMenu,
    isIconOnlyMenu,
    isMobileMenu,
    menuMode,
    shouldUseCompactVisualMenu,
  }
}
