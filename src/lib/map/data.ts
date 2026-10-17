// I18N
import { getI18n } from '#lib/i18n.js'
import { m } from '#lib/i18n.js'
// SERVICES
import { filterDivisions, getDivisionName } from '#lib/client/services/geospatial.js'
/// ENUMS
import { OmniCollection } from '#lib/enums.js'
// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { SearchResult } from '#lib/context/omni.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { FeatureExtended } from '#lib/db/zod/schema/feature.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SEARCH SOURCE HELPERS
//    - getWishlistedFeaturesAsync
//    - searchAllAsync

/**
 * Resolves the user's wishlisted features with hydrated hierarchy labels.
 *
 * @param appCtx - App context containing cached resources and hierarchy helpers.
 * @returns Wishlisted features enriched with hierarchy display labels.
 */
export async function getWishlistedFeaturesAsync(
  appCtx: ResourceViewCtx,
): Promise<FeatureExtended[]> {
  const wishlistedFeatures = appCtx.getWishlistedFeatures()

  return Promise.all(
    wishlistedFeatures.map(async feature => {
      const { layer, project, organisation } = await appCtx.getHierarchy(feature)

      const projectLayerCount = project
        ? appCtx.queries.rows.layer.filter((l: Layer) => l.projectId === project.id)
            .length
        : 0

      // Only include the layer label when it disambiguates multiple sibling layers.
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

/**
 * Projects query-backed search results and authoritative neighbourhood/list counts.
 *
 * @param term - Raw search term.
 * @param appCtx - App context containing cached query pages and locale helpers.
 * @returns Search result groups matching the provided term.
 */
export async function searchAllAsync(
  term: string,
  appCtx: ResourceViewCtx,
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  // Search labels must remain visible when the only matching title is a generated
  // translation; the feature card uses the same policy for navigation chrome.
  const searchPreferences = {
    ...appCtx.getUserPreferences(),
    allowMachineTranslation: true,
  }

  // Source 1 - Walks: the matching count comes from the user's filtered list query.
  const wishlistQuery = appCtx.resources.featureQueries.searchWishlist
  const wishlistCount =
    wishlistQuery.search === term.trim() ? wishlistQuery.totalCount : null
  if (wishlistCount !== null && wishlistCount > 0) {
    results.push({
      name: m.omni__title_star_walks(),
      count: wishlistCount,
      collectionType: OmniCollection.walk,
      ref: 'stars',
    })
  }

  // Source 2 - Neighbourhoods
  const neighbourhoodResults = filterDivisions(appCtx, term)
  neighbourhoodResults.forEach(([neighbourhoodRef, data]) => {
    // Broad regions remain searchable but do not crowd out the initial local preview.
    if (!term.trim() && ['area', 'district', 'major_island'].includes(data.class ?? ''))
      return
    const count = appCtx.divisionCtx.divisionFeatureCounts.get(neighbourhoodRef) ?? 0
    if (count > 0) {
      results.push({
        name: getDivisionName(data, appCtx.getUserPreferences()),
        count,
        collectionType: OmniCollection.neighbourhood,
        ref: neighbourhoodRef,
      })
    }
  })

  // Source 3 - Features: fresh cached previews are merged with bounded server pages.
  const featureQuery = appCtx.resources.featureQueries.search
  const features = featureQuery.search === term.trim() ? featureQuery.rows : []
  features.forEach(feature => {
    results.push({
      name: getI18n(feature, 'title', searchPreferences),
      count: 1,
      collectionType: OmniCollection.feature,
      ref: feature.id,
    })
  })

  return results
}
