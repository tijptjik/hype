// SVELTE
import { fromStore } from 'svelte/store'
// AUTH
import { useSession } from '#lib/auth/client.js'
import { isGuestUser } from '#lib/auth/upgrade.js'
// SHARED CONTRIBUTIONS
import { filterProfileContributions } from '#lib/contributions/presentation.js'
import { createUserContributionsModel } from './userContributions'
// ADAPTERS
import { useProfileContributionPreferences } from './useProfileContributionPreferences.svelte'
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
  const contributionPreferences = useProfileContributionPreferences(app)
  const visibleUserData = $derived(
    filterProfileContributions(
      app.panels.state.profile.ctx?.userData,
      contributionPreferences.showAll,
    ),
  )
  const profile = useProfileSectionModel(app, () => ({
    hideActions: true,
    hideEditableFields: true,
  }))

  return {
    // Get the username and profile loaded from URL navigation.
    get username() {
      return app.panels.state.profile.ctx?.username
    },
    get userData() {
      return visibleUserData
    },
    get showAllContributions() {
      return contributionPreferences.showAll
    },
    get contributionSettingsDisabled() {
      return contributionPreferences.disabled
    },
    onShowAllContributions: contributionPreferences.setShowAll,
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
      return contributionPreferences.observePrisms
    },
    onToggleObservePrisms: contributionPreferences.toggleObservePrisms,
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
