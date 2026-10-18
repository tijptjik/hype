// CONTEXT
import {
  FeatureQuery,
  FeatureQueryRetention,
} from '#lib/context/feature-query.svelte.js'
// RESOURCES
import { resourceProviders } from './providers.js'

/** Public feature traversal mechanics are imported only by surfaces that use them. */
export const mapResourceProviders = {
  ...resourceProviders,
  createFeatureMechanics: () => {
    const retention = new FeatureQueryRetention()
    return {
      retention,
      create: (bounded: boolean): FeatureQuery =>
        new FeatureQuery(resourceProviders.feature, retention, undefined, bounded),
    }
  },
}
