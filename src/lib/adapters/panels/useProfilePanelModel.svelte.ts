// SVELTE
import { untrack } from 'svelte'
import { fromStore } from 'svelte/store'
// AUTH
import { useSession } from '#lib/auth/client.js'
import { isGuestUser } from '#lib/auth/upgrade.js'
// I18N
import { getI18n } from '#lib/i18n.js'
// ADAPTERS
import { useProfileSectionModel } from './useProfileSectionModel.svelte'
// NAVIGATION
import {
  navigateToContributedFeature,
  navigateToContributedImage,
} from '#lib/navigation/index.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { Id, ResourceContext } from '#lib/types.js'
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
export function useProfilePanelModel(app: AppCtx, omni: OmniCtx) {
  const session = fromStore(useSession())
  const initializedProfileContexts = new WeakSet<object>()
  const profile = useProfileSectionModel(app, () => ({
    hideActions: true,
    hideEditableFields: true,
  }))

  // Apply the default once for each profile context so user toggles survive rerenders.
  $effect(() => {
    const profileContext = app.state.panels.profile.ctx
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
    get isSingleOrganisation() {
      return (app.hub as Hub | undefined)?.organisations?.length === 1
    },
    get observePrisms() {
      return app.state.panels.profile.ctx?.observePrisms ?? false
    },
    onToggleObservePrisms: () => {
      const profileContext = app.state.panels.profile.ctx
      if (!profileContext) return
      profileContext.observePrisms = !profileContext.observePrisms
      void app.refreshUserProfile()
    },
    getFeatureById: (id: string) => app.getFeatureById(id),
    getHierarchy: (resource: Parameters<AppCtx['getHierarchy']>[0]) =>
      app.getHierarchy(resource),
    getProjectHierarchy: async (id: Id): Promise<ResourceContext> => {
      const project = await app.getProjectById(id)
      return project ? app.getHierarchy(project) : {}
    },
    getOrganisationName: (
      organisation: Parameters<AppCtx['getContextualOrganisationName']>[0],
    ) => app.getContextualOrganisationName(organisation, false),
    getProjectName: (project: Parameters<AppCtx['getContextualProjectName']>[0]) =>
      app.getContextualProjectName(project),
    getFeatureName: (feature: FeatureFromCollection): string =>
      app.getContextualFeatureName(feature) ?? '',
    getFeatureAddress: (feature: FeatureFromCollection) =>
      getI18n(feature, 'displayAddress', {
        ...app.getUserPreferences(),
        allowMachineTranslation: true,
      }),
    getProjectTitle: (
      project: Parameters<AppCtx['getContextualProjectName']>[0],
    ): string => getI18n(project, 'name', { allowMachineTranslation: true }) ?? '',
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
  }
}
