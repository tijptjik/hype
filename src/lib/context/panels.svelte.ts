// LIB
import { DUAL_PANEL_MIN_WIDTH } from '#lib/constants.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { UserProfile } from '#lib/db/zod/schema/user.types.js'

const LEFT_PANELS: readonly Panel[] = [
  Panel.prisms,
  Panel.stars,
  Panel.plan,
  Panel.passport,
  Panel.eventCompanion,
  Panel.hub,
]
const RIGHT_PANELS: readonly Panel[] = [Panel.filters, Panel.settings, Panel.profile]

type PanelState = {
  [key in Panel]: {
    isOpen: boolean
    isOpenVisually?: boolean
    ctx?: {
      username?: string | null
      userData?: UserProfile | null
      observePrisms?: boolean
    }
  }
}

/** Canonical panel visibility and arbitration for one route surface. */
export class PanelController {
  readonly state = $state<PanelState>({
    admin: {
      isOpen: false,
      isOpenVisually: false,
    },
    profile: {
      isOpen: false,
      isOpenVisually: false,
      ctx: {
        username: null,
        userData: null,
        observePrisms: true,
      },
    },
    filters: {
      isOpen: false,
      isOpenVisually: false,
    },
    prisms: {
      isOpen: false,
      isOpenVisually: false,
    },
    stars: {
      isOpen: false,
      isOpenVisually: false,
    },
    plan: {
      isOpen: false,
      isOpenVisually: false,
    },
    passport: {
      isOpen: false,
      isOpenVisually: false,
    },
    eventCompanion: {
      isOpen: false,
      isOpenVisually: false,
    },
    settings: {
      isOpen: false,
      isOpenVisually: false,
    },
    hub: {
      isOpen: false,
      isOpenVisually: false,
    },
  })
  private lastOpenedPanel: Panel | null = null

  /** Reads logical visibility. @param panel Target panel. @returns Whether it is open. */
  isPanelOpen(panel: Panel): boolean {
    return this.state[panel].isOpen ?? false
  }

  /** Reads transient visual visibility. @param panel Target panel. @returns Whether it is visually open. */
  isPanelOpenVisually(panel: Panel): boolean {
    return this.state[panel].isOpenVisually ?? false
  }

  /** Reads combined visibility. @param panel Target panel. @returns Whether either visibility state is open. */
  isPanelOpenOrVisual(panel: Panel): boolean {
    return this.isPanelOpen(panel) || this.isPanelOpenVisually(panel)
  }

  /** Determines collapsed admin presentation. @param panel Target panel. @returns Whether the panel is narrow. */
  isPanelNarrow(panel: Panel): boolean {
    return panel === Panel.admin && !this.isPanelOpenOrVisual(panel)
  }

  /** Reads logical left-side occupancy. @returns Whether any left panel is open. */
  isLeftPanelOpen(): boolean {
    return LEFT_PANELS.some(panel => this.isPanelOpen(panel))
  }

  /** Reads logical right-side occupancy. @returns Whether any right panel is open. */
  isRightPanelOpen(): boolean {
    return RIGHT_PANELS.some(panel => this.isPanelOpen(panel))
  }

  /** Lists logical left-side openings. @returns Open left panels. */
  getOpenLeftPanels(): Panel[] {
    return LEFT_PANELS.filter(panel => this.isPanelOpen(panel))
  }

  /** Lists logical right-side openings. @returns Open right panels. */
  getOpenRightPanels(): Panel[] {
    return RIGHT_PANELS.filter(panel => this.isPanelOpen(panel))
  }

  /** Checks side membership. @param panel Target panel. @returns Whether it belongs on the left. */
  isPanelOnLeft(panel: Panel): boolean {
    return LEFT_PANELS.includes(panel)
  }

  /** Checks side membership. @param panel Target panel. @returns Whether it belongs on the right. */
  isPanelOnRight(panel: Panel): boolean {
    return RIGHT_PANELS.includes(panel)
  }

  /**
   * Updates panel visibility and records real openings for viewport arbitration.
   * @param panel - Panel whose visibility changed.
   * @param isOpen - Whether the panel is open.
   * @returns Nothing.
   */
  setPanelOpen(panel: Panel, isOpen: boolean): void {
    if (this.state[panel].isOpen !== isOpen) {
      this.state[panel].isOpen = isOpen
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
    return keepLeft ? this.getOpenRightPanels() : this.getOpenLeftPanels()
  }

  /** Updates transient visibility without changing opening recency. @param panel Target panel. @param isOpen Visual visibility. @returns Nothing. */
  setPanelOpenVisually(panel: Panel, isOpen: boolean): void {
    if (this.state[panel].isOpenVisually !== isOpen) {
      this.state[panel].isOpenVisually = isOpen
    }
  }
}
