// REMOTE
import {
  getUserContributedFeatures,
  getUserContributedImages,
} from '#lib/api/user.remote.js'
// I18N
import { getI18n } from '#lib/i18n.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Id, ResourceContext } from '#lib/types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type {
  navigateToContributedFeature,
  navigateToContributedImage,
} from '#lib/navigation/index.js'

type WithoutContexts<T extends unknown[]> = T extends [unknown, unknown, ...infer Rest]
  ? Rest
  : never
export type ContributionNavigation = {
  onContributedFeature: (
    ...args: WithoutContexts<Parameters<typeof navigateToContributedFeature>>
  ) => void | Promise<void>
  onContributedImage: (
    ...args: WithoutContexts<Parameters<typeof navigateToContributedImage>>
  ) => void | Promise<void>
}

/**
 * Shares contribution display helpers between the map panel and admin profiles.
 * @param app Route-owned app context for resource hydration and translated labels.
 * @param navigation Destination-specific feature and photo handlers.
 * @returns A context-independent rendering model for contribution sections.
 */
export function createUserContributionsModel(
  app: ResourceViewCtx,
  navigation: ContributionNavigation,
) {
  return {
    // Await each bounded page directly; display rows do not retain map detail handles.
    getFeatures: async (userId: string, ids: string[]) =>
      await getUserContributedFeatures({
        userId,
        ids,
        meta: { isAdminRequest: app.isAdmin() },
      }),
    getImages: async (userId: string, ids: string[]) =>
      await getUserContributedImages({
        userId,
        ids,
        meta: { isAdminRequest: app.isAdmin() },
      }),
    getHierarchy: (resource: Parameters<ResourceViewCtx['getHierarchy']>[0]) =>
      app.getHierarchy(resource),
    getProjectHierarchy: async (id: Id): Promise<ResourceContext> => {
      const project = await app.getProjectById(id)
      return project ? app.getHierarchy(project) : {}
    },
    getOrganisationName: (
      organisation: Parameters<ResourceViewCtx['getContextualOrganisationName']>[0],
    ) => app.getContextualOrganisationName(organisation, false),
    getProjectName: (
      project: Parameters<ResourceViewCtx['getContextualProjectName']>[0],
      inOrganisationContext: boolean = false,
    ) => app.getContextualProjectName(project, false, true, inOrganisationContext),
    getFeatureName: (feature: FeatureFromCollection): string =>
      app.getContextualFeatureName(feature) ?? '',
    getFeatureAddress: (feature: FeatureFromCollection) =>
      getI18n(feature, 'displayAddress', {
        ...app.getUserPreferences(),
        allowMachineTranslation: true,
      }),
    getProjectTitle: (
      project: Parameters<ResourceViewCtx['getContextualProjectName']>[0],
    ): string => getI18n(project, 'name', { allowMachineTranslation: true }) ?? '',
    ...navigation,
  }
}

export type UserContributionsModel = ReturnType<typeof createUserContributionsModel>
