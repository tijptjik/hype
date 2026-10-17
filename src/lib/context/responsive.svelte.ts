// SVELTE
import { getContext, hasContext, setContext } from 'svelte'
// LIB
import { hasElevatedChrome } from '#lib/layout/chrome.js'
import {
  getMenuClearanceHeight,
  getMenuReservedHeight,
} from '#lib/bits/patterns/bars/appMenu/appMenu.layout.js'
import { DUAL_PANEL_MIN_WIDTH, MOBILE_MAX_WIDTH, PANEL_WIDTH } from '#lib/constants.js'
// ENUMS
import { Panel, PanelLeft, PanelRight } from '#lib/enums.js'

const RESPONSIVE_CONTEXT_KEY = Symbol('responsive-context')
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
  private lastOpenedPanel: Panel | null = null

  get isMobile(): boolean {
    return this.window.width < MOBILE_MAX_WIDTH
  }

  get menuClearanceHeight(): number {
    return getMenuClearanceHeight(
      this.window.width,
      this.window.height,
      this.getEffectiveAppMainWidth(),
    )
  }

  get menuReservedHeight(): number {
    return getMenuReservedHeight(
      this.window.width,
      this.window.height,
      this.getEffectiveAppMainWidth(),
    )
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

  /**
   * Updates panel visibility and records real openings for viewport arbitration.
   * @param panel - Panel whose visibility changed.
   * @param isOpen - Whether the panel is open.
   * @returns Nothing.
   */
  setPanelOpen(panel: Panel, isOpen: boolean): void {
    if (this.panelOpenState[panel] !== isOpen) {
      this.panelOpenState[panel] = isOpen
      if (isOpen) this.lastOpenedPanel = panel
    }
  }

  /**
   * Finds the older side to close when the viewport cannot fit both panels.
   * @param width - Layout viewport width in pixels, matching the opening guard.
   * @returns Open panels opposite the most recently opened panel.
   * @remarks Unmeasured and wide viewports, and a single open side, need no changes.
   */
  getPanelsToCloseForViewport(width: number): Panel[] {
    if (width <= 0 || width >= DUAL_PANEL_MIN_WIDTH) return []
    if (!this.isLeftPanelOpen() || !this.isRightPanelOpen()) return []

    // Preserve the latest opening; a resize never reopens previously closed panels.
    const keepLeft =
      this.lastOpenedPanel !== null && this.isPanelOnLeft(this.lastOpenedPanel)
    return (keepLeft
      ? this.getOpenRightPanels()
      : this.getOpenLeftPanels()) as unknown as Panel[]
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
