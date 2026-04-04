// SVELTE
import { getContext, hasContext, setContext } from 'svelte'
// LIB
import {
  getMenuClearanceHeight,
  getMenuReservedHeight,
} from '$lib/bits/patterns/bars/appMenu/appMenu.layout'
import { MOBILE_MAX_WIDTH, PANEL_WIDTH } from '$lib/constants'
// ENUMS
import { Panel, PanelLeft, PanelRight } from '$lib/enums'

const RESPONSIVE_CONTEXT_KEY = Symbol('responsive-context')
const ELEVATED_CHROME_MIN_WIDTH_PX = 480
const ELEVATED_CHROME_WIDE_VIEWPORT_MIN_WIDTH_PX = 768
const ELEVATED_CHROME_MIN_HEIGHT_PX = 800
const ELEVATED_CHROME_EXTRA_REQUIRED_HEIGHT_PX = 40
const ELEVATED_CHROME_DESKTOP_WIDE_EXTRA_REQUIRED_HEIGHT_PX = 48
const ELEVATED_CHROME_DESKTOP_WIDE_MIN_WIDTH_PX = 1280

export type ResponsiveDimensions = {
  width: number
  height: number
}

export type ResponsiveViewport = ResponsiveDimensions & {
  offsetTop: number
  offsetLeft: number
}

type PanelOpenState = Record<Panel, boolean>

const createPanelOpenState = (): PanelOpenState =>
  Object.fromEntries(
    Object.values(Panel).map(panel => [panel, false]),
  ) as PanelOpenState

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

export function hasElevatedChrome(width: number, height: number): boolean {
  return (
    width >= ELEVATED_CHROME_WIDE_VIEWPORT_MIN_WIDTH_PX ||
    (width >= ELEVATED_CHROME_MIN_WIDTH_PX &&
      height >= getElevatedChromeMinHeight(width))
  )
}

export class ResponsiveCtx {
  window = $state({
    width: 0,
    height: 0,
  })
  viewport = $state<ResponsiveViewport>({
    width: 0,
    height: 0,
    offsetTop: 0,
    offsetLeft: 0,
  })
  main = $state({
    width: 0,
    height: 0,
  })
  panelOpenState = $state<PanelOpenState>(createPanelOpenState())
  panelVisualOpenState = $state<PanelOpenState>(createPanelOpenState())

  get isMobile(): boolean {
    return this.window.width < MOBILE_MAX_WIDTH
  }

  get menuClearanceHeight(): number {
    return getMenuClearanceHeight(this.window.width, this.window.height)
  }

  get menuReservedHeight(): number {
    return getMenuReservedHeight(this.window.width, this.window.height)
  }

  get visibleWindowHeight(): number {
    return this.viewport.height || this.window.height
  }

  get visibleWindowWidth(): number {
    return this.viewport.width || this.window.width
  }

  get hasElevatedChrome(): boolean {
    return hasElevatedChrome(this.visibleWindowWidth, this.visibleWindowHeight)
  }

  get keyboardInsetHeight(): number {
    return Math.max(
      0,
      this.window.height - this.visibleWindowHeight - this.viewport.offsetTop,
    )
  }

  isPanelOpen(panel: Panel): boolean {
    return this.panelOpenState[panel] ?? false
  }

  isPanelOpenVisually(panel: Panel): boolean {
    return this.panelVisualOpenState[panel] ?? false
  }

  isPanelOpenOrVisual(panel: Panel): boolean {
    return this.isPanelOpen(panel) || this.isPanelOpenVisually(panel)
  }

  isPanelNarrow(panel: Panel): boolean {
    return (!this.isPanelOpenOrVisual(Panel.admin) && panel === Panel.admin) || false
  }

  isLeftPanelOpen(): boolean {
    return Object.values(PanelLeft).some(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  isRightPanelOpen(): boolean {
    return Object.values(PanelRight).some(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  getOpenLeftPanels(): PanelLeft[] {
    return Object.values(PanelLeft).filter(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  getOpenRightPanels(): PanelRight[] {
    return Object.values(PanelRight).filter(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  isPanelOnLeft(panel: Panel): boolean {
    return Object.values(PanelLeft).includes(panel as unknown as PanelLeft)
  }

  isPanelOnRight(panel: Panel): boolean {
    return Object.values(PanelRight).includes(panel as unknown as PanelRight)
  }

  getAppMainOffsetX(): number {
    if (this.isMobile) {
      return 0
    }

    const leftPanelOpen = this.isLeftPanelOpen()
    const rightPanelOpen = this.isRightPanelOpen()

    if (leftPanelOpen && rightPanelOpen) {
      return 0
    }

    if (leftPanelOpen) {
      return PANEL_WIDTH / 2
    }

    if (rightPanelOpen) {
      return -PANEL_WIDTH / 2
    }

    return 0
  }

  getEffectiveAppMainWidth(): number {
    if (this.isMobile) {
      return this.main.width
    }

    const leftPanelWidth = this.isLeftPanelOpen() ? PANEL_WIDTH : 0
    const rightPanelWidth = this.isRightPanelOpen() ? PANEL_WIDTH : 0

    return Math.max(0, this.main.width - leftPanelWidth - rightPanelWidth)
  }

  setPanelOpen(panel: Panel, isOpen: boolean): void {
    if (this.panelOpenState[panel] !== isOpen) {
      this.panelOpenState[panel] = isOpen
    }
  }

  setPanelOpenVisually(panel: Panel, isOpen: boolean): void {
    if (this.panelVisualOpenState[panel] !== isOpen) {
      this.panelVisualOpenState[panel] = isOpen
    }
  }

  setWindowDimensions(width: number, height: number): void {
    if (this.window.width !== width) {
      this.window.width = width
    }

    if (this.window.height !== height) {
      this.window.height = height
    }
  }

  setViewportDimensions(
    width: number,
    height: number,
    offsetTop: number = 0,
    offsetLeft: number = 0,
  ): void {
    if (this.viewport.width !== width) {
      this.viewport.width = width
    }

    if (this.viewport.height !== height) {
      this.viewport.height = height
    }

    if (this.viewport.offsetTop !== offsetTop) {
      this.viewport.offsetTop = offsetTop
    }

    if (this.viewport.offsetLeft !== offsetLeft) {
      this.viewport.offsetLeft = offsetLeft
    }
  }

  setMainDimensions(width: number, height: number): void {
    if (this.main.width !== width) {
      this.main.width = width
    }

    if (this.main.height !== height) {
      this.main.height = height
    }
  }
}

export function setResponsiveCtx(): ResponsiveCtx {
  return setContext(RESPONSIVE_CONTEXT_KEY, new ResponsiveCtx())
}

export function getResponsiveCtx(): ResponsiveCtx {
  if (hasContext(RESPONSIVE_CONTEXT_KEY)) {
    return getContext<ResponsiveCtx>(RESPONSIVE_CONTEXT_KEY)
  }

  throw new Error('ResponsiveCtx is not set')
}
