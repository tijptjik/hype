// REMOTE
import { getFeature } from '#lib/api/feature.remote.js'
// I18N
import { getI18n } from '#lib/i18n.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'
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
  app: AppCtx,
  navigation: ContributionNavigation,
) {
  return {
    // Await the remote directly; profile rows do not retain the map's detail handles.
    getFeatureById: async (id: string) => {
      const result = await getFeature({
        ref: id,
        refKey: 'id',
        meta: { profile: 'default', isAdminRequest: app.isAdmin() },
      })
      return result.data ?? undefined
    },
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
    ...navigation,
  }
}

export type UserContributionsModel = ReturnType<typeof createUserContributionsModel>
