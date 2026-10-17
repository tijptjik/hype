// NAVIGATION
import { updatePanelUrlParams } from '#lib/navigation/index.js'
// LIB
import { DUAL_PANEL_MIN_WIDTH, isMobile } from '#lib/constants.js'
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

type PanelEffects = {
  loadProfile: () => Promise<void>
  invalidateProfile: () => void
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
  private focusTimeout: ReturnType<typeof setTimeout> | null = null

  /** Creates panel commands with explicit profile effects. @param effects Profile loading and invalidation capabilities. */
  constructor(
    private readonly effects: PanelEffects = {
      loadProfile: async () => {},
      invalidateProfile: () => {},
    },
  ) {}

  /** Cancels deferred focus work. @returns Nothing. */
  dispose(): void {
    if (this.focusTimeout !== null) clearTimeout(this.focusTimeout)
    this.focusTimeout = null
  }

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

  /** Synchronizes logical visibility and profile parameters once per command. @returns Nothing. */
  private syncUrl(): void {
    if (typeof window === 'undefined') return
    const panelState = Object.fromEntries(
      Object.entries(this.state).map(([key, value]) => [key, value.isOpen]),
    )
    updatePanelUrlParams(panelState, this)
  }

  // Panel methods
  /** Toggles visibility and arbitrates panels on either side. @param panel Target panel. @param updateUrl Whether to synchronize URL state. @returns Nothing. */
  togglePanel = (panel: Panel, updateUrl: boolean = true): void => {
    const currentState = this.isPanelOpen(panel)

    // Close other panels on the same side first (without updating URL individually)
    if (this.isPanelOnLeft(panel)) {
      const openLeftPanels = this.getOpenLeftPanels()
      openLeftPanels
        .filter(openPanel => openPanel !== panel)
        .forEach(openPanel => {
          this.closePanel(openPanel, false)
        })
    } else if (this.isPanelOnRight(panel)) {
      const openRightPanels = this.getOpenRightPanels()
      openRightPanels
        .filter(openPanel => openPanel !== panel)
        .forEach(openPanel => {
          this.closePanel(openPanel, false)
        })
    }

    if (window.innerWidth < DUAL_PANEL_MIN_WIDTH) {
      // Close all panels first, then toggle the target panel based on original state
      this.closeAllPanels(false)
      if (!currentState) {
        // Panel was closed, so open it
        this.openPanel(panel, false)
        if (!isMobile()) {
          this.focusPanel(this.isPanelOnLeft(panel) ? 'left' : 'right')
        }
      }
      // If panel was open, leave it closed (toggle behavior)
    } else {
      // Toggle the current panel
      if (currentState) {
        this.closePanel(panel, false)
      } else {
        this.openPanel(panel, false)
        if (!isMobile()) {
          this.focusPanel(this.isPanelOnLeft(panel) ? 'left' : 'right')
        }
      }
    }

    // Update URL once at the end with the final panel state (only if updateUrl is true)
    if (updateUrl) this.syncUrl()
  }

  /** Schedules focus after panel layout has settled. @param position Side whose first input should receive focus. @returns Nothing. */
  focusPanel = (position: 'left' | 'right'): void => {
    if (this.focusTimeout !== null) clearTimeout(this.focusTimeout)
    this.focusTimeout = setTimeout(() => {
      this.focusTimeout = null
      const panelElement = document.getElementById(`${position}-panel`)
      const inputElement = panelElement?.querySelector('input')
      if (inputElement) {
        inputElement.focus()
      } else {
        panelElement?.focus()
      }
    }, 250)
  }

  /** Closes the left side without changing the URL. @returns Nothing. */
  closeLeftPanel = (): void => {
    this.getOpenLeftPanels().forEach((openPanel: Panel) => {
      this.closePanel(openPanel, false)
    })
  }

  /** Closes the right side without changing the URL. @returns Nothing. */
  closeRightPanel = (): void => {
    this.getOpenRightPanels().forEach((openPanel: Panel) => {
      this.closePanel(openPanel, false)
    })
  }

  /** Closes every panel and optionally synchronizes the URL. @param updateUrl Whether to synchronize URL state. @returns Nothing. */
  closeAllPanels = (updateUrl: boolean = true): void => {
    Object.keys(this.state).forEach(panel => {
      this.closePanel(panel as unknown as Panel, false)
    })
    if (updateUrl) this.syncUrl()
  }

  /** Opens a panel and lazily hydrates profile data. @param panel Target panel. @param updateUrl Whether to synchronize URL state. @returns Nothing. */
  openPanel = (panel: Panel, updateUrl: boolean = true): void => {
    this.setPanelOpen(panel, true)

    // Contribution data is relation-heavy, so only load it when the profile panel needs it.
    if (
      panel === Panel.profile &&
      this.state.profile.ctx?.username &&
      !this.state.profile.ctx.userData
    ) {
      void this.effects.loadProfile().catch(error => {
        console.error('[PanelController] Profile panel hydration failed:', error)
      })
    }

    // Handle stateful parameters for specific panels
    if (updateUrl) this.syncUrl()
  }

  /** Closes a panel and optionally synchronizes the URL. @param panel Target panel. @param updateUrl Whether to synchronize URL state. @returns Nothing. */
  closePanel = (panel: Panel, updateUrl: boolean = true): void => {
    this.setPanelOpen(panel, false)
    if (updateUrl) this.syncUrl()
  }

  // Visual-only panel methods for auto-hide behavior
  /** Shows a panel transiently for auto-hide behavior. @param panel Target panel. @returns Nothing. */
  openPanelVisually = (panel: Panel): void => {
    this.setPanelOpenVisually(panel, true)
  }

  /** Clears transient auto-hide visibility. @param panel Target panel. @returns Nothing. */
  closePanelVisually = (panel: Panel): void => {
    this.setPanelOpenVisually(panel, false)
  }

  // Helper method to open profile panel with username context
  /** Updates profile context and invalidates previous hydration. @param panel Target panel. @param key Context field. @param value Requested username. @returns Nothing. */
  setPanelCtx = (
    panel: Panel,
    key: 'username',
    value: string | undefined | null,
  ): void => {
    // Set username context if provided
    const context = this.state[panel].ctx
    if (value && context) {
      if (context[key] !== value) {
        // Do not display the previous profile while the new profile is loading.
        context.userData = null
        this.effects.invalidateProfile()
      }
      context[key] = value
    }
  }
}
