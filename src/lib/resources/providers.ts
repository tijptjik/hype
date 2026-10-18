// API
import { getResourcePage, getPinnedResource } from '#lib/api/resources.remote.js'
import { getFeaturePage } from '#lib/api/featureQueries.remote.js'

/** Remote factories for map and resource-editor surfaces; the root does not import these. */
export const resourceProviders = {
  page: getResourcePage,
  pin: getPinnedResource,
  feature: getFeaturePage,
}
