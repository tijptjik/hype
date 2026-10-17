// SVELTE
import { untrack } from 'svelte'
import { fromStore } from 'svelte/store'
// AUTH
import { useSession } from '#lib/auth/client.js'
import { isGuestUser } from '#lib/auth/upgrade.js'
// SHARED CONTRIBUTIONS
import { createUserContributionsModel } from './userContributions'
// ADAPTERS
import { useProfileSectionModel } from './useProfileSectionModel.svelte'
// NAVIGATION
import {
  navigateToContributedFeature,
  navigateToContributedImage,
} from '#lib/navigation/index.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { Id } from '#lib/types.js'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { Image } from '#lib/db/zod/schema/image.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'

/**
 * Resolves the displayed profile and guest-upgrade state at the route boundary.
 * @param app - Route-owned application context.
 * @param omni - Route-owned collection navigation context.
 * @returns Reactive profile data and controlled profile-section props.
 */
export function useProfilePanelModel(app: ResourceViewCtx, omni: OmniCtx) {
  const session = fromStore(useSession())
  const initializedProfileContexts = new WeakSet<object>()
  const profile = useProfileSectionModel(app, () => ({
    hideActions: true,
    hideEditableFields: true,
  }))

  // Apply the default once for each profile context so user toggles survive rerenders.
  $effect(() => {
    const profileContext = app.panels.state.profile.ctx
    const hub = app.hub as Hub | undefined
    if (!profileContext || !hub || initializedProfileContexts.has(profileContext))
      return

    untrack(() => {
      profileContext.observePrisms = hub.organisations?.length !== 1
    })
    initializedProfileContexts.add(profileContext)
  })

  return {
    // Get the username and profile loaded from URL navigation.
    get username() {
      return app.panels.state.profile.ctx?.username
    },
    get userData() {
      return app.panels.state.profile.ctx?.userData
    },
    get isOwnProfile() {
      return app.panels.state.profile.ctx?.userData?.id === app.account.user?.id
    },
    get isGuestAccount() {
      return isGuestUser(session.current.data?.user)
    },
    get accountUsername() {
      return app.account.user?.username ?? undefined
    },
    get profileProps() {
      return profile.getProfileProps()
    },
    get isSingleOrganisation() {
      return (app.hub as Hub | undefined)?.organisations?.length === 1
    },
    get observePrisms() {
      return app.panels.state.profile.ctx?.observePrisms ?? false
    },
    onToggleObservePrisms: () => {
      const profileContext = app.panels.state.profile.ctx
      if (!profileContext) return
      profileContext.observePrisms = !profileContext.observePrisms
      void app.refreshUserProfile()
    },
    ...createUserContributionsModel(app, {
      onContributedFeature: (
        featureId: string,
        projectId: Id,
        features: (FeatureFromCollection | Feature)[],
        projectName: string,
        username: string,
      ) =>
        navigateToContributedFeature(
          app,
          omni,
          featureId,
          projectId,
          features,
          projectName,
          username,
        ),
      onContributedImage: (
        featureId: string,
        projectId: Id,
        imageId: string,
        projectName: string,
        username: string,
        loadedImages: Map<string, Pick<Image, 'featureId'>>,
        projectImageIds: Record<Id, Id[]>,
      ) =>
        navigateToContributedImage(
          app,
          omni,
          featureId,
          projectId,
          imageId,
          projectName,
          username,
          loadedImages,
          projectImageIds,
        ),
    }),
  }
}
