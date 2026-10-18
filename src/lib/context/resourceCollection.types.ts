// TYPES
import type {
  FeatureFromCollection,
  Feature,
} from '#lib/db/zod/schema/feature.types.js'
import type { LocaleKey } from '#lib/types.js'

export type ActiveCollection = {
  id: string
  type: 'neighbourhood' | 'walk' | 'feature' | 'search'
  i18n: Record<LocaleKey, { name: string }>
  items: (FeatureFromCollection | Feature)[]
  /** Authoritative matching count for paginated feature collections. */
  totalCount?: number | null
} | null
