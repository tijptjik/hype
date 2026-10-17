// AUTH
import { isGuestUser, requestProfileUpgrade } from '#lib/auth/upgrade.js'
// NAVIGATION
import { getUrlParam } from '#lib/navigation/index.js'
// SERVICES
import {
  consumeEscapeForOpenPanels,
  shouldSkipGlobalKeydown,
} from '#lib/client/keybindings.js'
// ENUMS
import { Panel } from '#lib/enums.js'
// TYPES
import type { AccountState } from './account.svelte.js'
import type { PanelController } from './panels.svelte.js'

/** Surface keyboard lifetime using the existing panel and account owners. */
export class SurfaceInteractions {
  /**
   * Creates shortcuts without access to resource queries or cache state.
   * @param panels Surface panel command owner.
   * @param account Root-owned account.
   * @param isAdmin Current surface mode.
   * @param isCoreHub Current hub policy.
   */
  constructor(
    private readonly panels: PanelController,
    private readonly account: AccountState,
    private readonly isAdmin: () => boolean,
    private readonly isCoreHub: () => boolean,
  ) {}

  /** Releases keyboard registration. @returns Nothing. */
  dispose(): void {
    this.unregisterKeydownHandlers()
  }

  // KEYDOWN HANDLERS
  /** Registers global shortcuts once. @returns Nothing. */
  registerKeydownHandlers = (): void => {
    if (typeof document !== 'undefined')
      document.addEventListener('keydown', this.handleKeydown)
  }

  /** Removes global shortcuts on teardown. @returns Nothing. */
  unregisterKeydownHandlers = (): void => {
    if (typeof document !== 'undefined')
      document.removeEventListener('keydown', this.handleKeydown)
  }

  /** Handles panel shortcuts outside editable controls. @param event Keyboard event. @returns Nothing. */
  handleKeydown = (event: KeyboardEvent): void => {
    // Skip global keyboard shortcuts when any input element is focused
    const activeElement = document.activeElement
    if (shouldSkipGlobalKeydown(activeElement)) {
      return
    }

    if (
      consumeEscapeForOpenPanels(
        event,
        Object.values(this.panels.state).some(panel => panel.isOpen),
      )
    ) {
      this.panels.closeAllPanels()
      return
    }

    let keyMatched = false

    if (event.key === '1') {
      if (this.isAdmin()) {
        this.panels.togglePanel(Panel.admin)
      } else {
        if (this.isCoreHub()) {
          this.panels.togglePanel(Panel.prisms)
        } else {
          this.panels.togglePanel(Panel.hub)
        }
      }
      keyMatched = true
    } else if (event.key === '2') {
      if (this.isAdmin()) {
        this.panels.togglePanel(Panel.settings)
      } else {
        this.panels.togglePanel(Panel.filters)
      }
      keyMatched = true
    } else if (event.key === '3') {
      this.panels.togglePanel(Panel.stars)
      keyMatched = true
    } else if (event.key === '4') {
      this.panels.togglePanel(Panel.settings)
      keyMatched = true
    } else if (event.key === '5') {
      const user = this.account.user
      if (isGuestUser(user)) {
        requestProfileUpgrade(window.location.href)
        event.preventDefault()
        event.stopPropagation()
        return
      }
      // If no username param is set, use the user's username
      this.panels.setPanelCtx(
        Panel.profile,
        'username',
        getUrlParam('username') || this.account.user?.username,
      )
      this.panels.togglePanel(Panel.profile)
      keyMatched = true
    }

    if (keyMatched) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
}
