// TYPES
import type { FeatureFromCollection, Feature } from '$lib/db/zod/schema/feature.types'
import type { LocaleKey } from '$lib/types'

export type ActiveCollection = {
  id: string
  type: 'neighbourhood' | 'walk' | 'feature' | 'search'
  i18n: Record<LocaleKey, { name: string }>
  items: (FeatureFromCollection | Feature)[]
  /** Authoritative matching count for paginated feature collections. */
  totalCount?: number | null
} | null
