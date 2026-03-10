// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// SERVICES
import { filterPlaces } from '$lib/client/services/geospatial'
/// ENUMS
import { OmniCollection } from '$lib/enums'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { SearchResult } from '$lib/types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  FeatureExtended,
  FeatureFromCollection,
} from '$lib/db/zod/schema/feature.types'

// Async version that uses getHierarchy for guaranteed data with cache-miss handling
export async function getWishlistedFeaturesAsync(
  appCtx: AppCtx,
): Promise<FeatureExtended[]> {
  const wishlistedFeatures = appCtx.getWishlistedFeatures()

  return Promise.all(
    wishlistedFeatures.map(async feature => {
      const { layer, project, organisation } = await appCtx.getHierarchy(feature)

      const projectLayerCount = project
        ? appCtx.state.resources.layer.filter((l: Layer) => l.projectId === project.id)
            .length
        : 0

      return {
        ...feature,
        hierarchy: {
          organisation: organisation
            ? getI18n(organisation, 'nameShort', appCtx.getUserPreferences())
            : null,
          project: project
            ? getI18n(project, 'nameShort', appCtx.getUserPreferences())
            : null,
          layer:
            layer && projectLayerCount > 1
              ? getI18n(layer, 'nameShort', appCtx.getUserPreferences())
              : null,
          feature: getI18n(feature, 'title', appCtx.getUserPreferences()),
        },
      }
    }),
  )
}

export async function searchAllAsync(
  term: string,
  appCtx: AppCtx,
): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  // Source 1 - Walks
  const wishlistResults = await getWishlistedFeaturesAsync(appCtx)
  const filteredWishlistResults = wishlistResults.filter((feature: FeatureExtended) =>
    feature?.hierarchy.feature?.toLowerCase().includes(term.toLowerCase()),
  )
  if (filteredWishlistResults.length > 0) {
    results.push({
      name: m.omni__title_star_walks(),
      count: filteredWishlistResults.length,
      collectionType: OmniCollection.walk,
      ref: 'stars',
    })
  }

  // Source 2 - Neighbourhoods
  const neighbourhoodResults = filterPlaces(appCtx, term)
  neighbourhoodResults.forEach(([neighbourhoodRef, data]) => {
    const count = appCtx.placeCtx.neighbourhoodFeatureCounts.get(neighbourhoodRef) ?? 0
    if (count > 0) {
      results.push({
        name: getI18n(data, 'name', appCtx.getUserPreferences()),
        count,
        collectionType: OmniCollection.neighbourhood,
        ref: neighbourhoodRef,
      })
    }
  })

  // Source 3 - Features
  Array.from(appCtx.features.values())
    .filter((feature): feature is FeatureFromCollection => {
      const title = getI18n(feature, 'title', appCtx.getUserPreferences())
      const description = getI18n(feature, 'description', appCtx.getUserPreferences())
      const displayAddress = getI18n(
        feature,
        'displayAddress',
        appCtx.getUserPreferences(),
      )
      const lowerTerm = term.toLowerCase()
      return (
        (typeof title === 'string' && title.toLowerCase().includes(lowerTerm)) ||
        (typeof description === 'string' &&
          description.toLowerCase().includes(lowerTerm)) ||
        (typeof displayAddress === 'string' &&
          displayAddress.toLowerCase().includes(lowerTerm))
      )
    })
    .forEach(feature => {
      results.push({
        name: getI18n(feature, 'title', appCtx.getUserPreferences()),
        count: 1,
        collectionType: OmniCollection.feature,
        ref: feature.id,
      })
    })

  return results
}
