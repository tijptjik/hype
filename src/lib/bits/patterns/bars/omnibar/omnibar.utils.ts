const MIN_OMNIBAR_HEIGHT_PX = 160
const OMNIBAR_BOTTOM_GUTTER_PX = 24

export function getOmnibarAvailableViewportHeight(
  visibleWindowHeight: number,
  menuClearanceHeight: number,
): number {
  return Math.max(
    MIN_OMNIBAR_HEIGHT_PX,
    visibleWindowHeight - menuClearanceHeight - OMNIBAR_BOTTOM_GUTTER_PX,
  )
}
