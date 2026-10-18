// SVELTE
import { getContext, setContext } from 'svelte'
// LAYOUT
import {
  getMenuClearanceHeight,
  getMenuReservedHeight,
} from '#lib/bits/patterns/bars/appMenu/appMenu.layout.js'
import { PANEL_WIDTH } from '#lib/constants.js'
// CONTEXT
import { PanelController } from './panels.svelte.js'
import type { ResponsiveCtx } from './responsive.svelte.js'

const SURFACE_LAYOUT_KEY = Symbol('surface-layout')

/** Geometry belonging to one surface, independent of root measurement lifetime. */
export class SurfaceLayout {
  main = $state({ width: 0, height: 0 })
  constructor(
    readonly responsive: ResponsiveCtx,
    readonly panels = new PanelController(),
  ) {}

  get menuClearanceHeight(): number {
    return getMenuClearanceHeight(
      this.responsive.window.width,
      this.responsive.window.height,
      this.getEffectiveAppMainWidth(),
    )
  }

  get menuReservedHeight(): number {
    return getMenuReservedHeight(
      this.responsive.window.width,
      this.responsive.window.height,
      this.getEffectiveAppMainWidth(),
    )
  }

  /** Centers overlays in the space remaining beside panels. @returns Horizontal offset in pixels. */
  getAppMainOffsetX(): number {
    if (this.responsive.isMobile) {
      return 0
    }

    const leftPanelOpen = this.panels.isLeftPanelOpen()
    const rightPanelOpen = this.panels.isRightPanelOpen()

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

  /** Subtracts logical desktop panels from the measured main region. @returns Available content width in pixels. */
  getEffectiveAppMainWidth(): number {
    if (this.responsive.isMobile) {
      return this.main.width
    }

    const leftPanelWidth = this.panels.isLeftPanelOpen() ? PANEL_WIDTH : 0
    const rightPanelWidth = this.panels.isRightPanelOpen() ? PANEL_WIDTH : 0

    return Math.max(0, this.main.width - leftPanelWidth - rightPanelWidth)
  }

  /** Updates this surface main region. @param width Measured width. @param height Measured height. @returns Nothing. */
  setMainDimensions(width: number, height: number): void {
    if (this.main.width !== width) {
      this.main.width = width
    }

    if (this.main.height !== height) {
      this.main.height = height
    }
  }
}

/** Provides surface geometry without importing resource orchestration. @param layout Surface-owned model. @returns The supplied model. */
export function setSurfaceLayoutCtx(layout: SurfaceLayout): SurfaceLayout {
  return setContext(SURFACE_LAYOUT_KEY, layout)
}

/** Resolves geometry when rendered inside a surface. @returns Surface layout, or undefined for standalone presentation. */
export function getSurfaceLayoutCtx(): SurfaceLayout | undefined {
  return getContext<SurfaceLayout | undefined>(SURFACE_LAYOUT_KEY)
}
