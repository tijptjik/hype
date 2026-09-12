// SVELTE
import { fromStore } from 'svelte/store'
// AUTH
import { useSession } from '$lib/auth/client'
import { isGuestUser } from '$lib/auth/upgrade'
// ADAPTERS
import { useProfileSectionModel } from './useProfileSectionModel.svelte'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'

/**
 * Resolves the displayed profile and guest-upgrade state at the route boundary.
 * @param app - Route-owned application context.
 * @returns Reactive profile data and controlled profile-section props.
 */
export function useProfilePanelModel(app: AppCtx) {
  const session = fromStore(useSession())
  const profile = useProfileSectionModel(app, () => ({
    hideActions: true,
    hideEditableFields: true,
  }))
  return {
    // Get the username and profile loaded from URL navigation.
    get username() {
      return app.state.panels.profile.ctx?.username
    },
    get userData() {
      return app.state.panels.profile.ctx?.userData
    },
    get isOwnProfile() {
      return app.state.panels.profile.ctx?.userData?.id === app.getUser()?.id
    },
    get isGuestAccount() {
      return isGuestUser(session.current.data?.user)
    },
    get accountUsername() {
      return app.getUser()?.username ?? undefined
    },
    get profileProps() {
      return profile.getProfileProps()
    },
  }
}
