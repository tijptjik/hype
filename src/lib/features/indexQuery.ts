// VALIDATION
import { z } from 'zod'
// CONTRACTS
import { ListQueryParamsSchema } from '#lib/db/zod/schema/api.js'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

const tri = z.boolean().nullable().optional()
const locales = z.object({ en: tri, zhHans: tri, zhHant: tri }).strict()

/** Shared wire contract for local previews, authoritative rows and exact counts. */
export const FeatureIndexFiltersSchema = z
  .object({
    isPublished: tri,
    isArchived: tri,
    isPendingReview: tri,
    isIntangible: tri,
    isVisitable: tri,
    hasTitle: tri,
    hasDescription: tri,
    hasDisplayAddress: tri,
    hasImage: tri,
    isOneImagePublished: tri,
    isAllImagePublished: tri,
    isAllRightsReserved: tri,
    isPublicDomain: tri,
    hasLicenseBy: tri,
    hasLicenseSa: tri,
    hasLicenseNc: tri,
    hasLicenseNd: tri,
    translationLocales: z
      .object({ en: z.boolean(), zhHans: z.boolean(), zhHant: z.boolean() })
      .partial()
      .strict()
      .optional(),
    isTitleTranslated: locales.optional(),
    isDescriptionTranslated: locales.optional(),
    isAddressTranslated: locales.optional(),
    isSpecifierTranslated: locales.optional(),
    properties: z.record(z.string().min(1).max(200), z.boolean().nullable()).optional(),
  })
  .strict()

export const FeatureIndexQuerySchema = ListQueryParamsSchema.extend({
  filters: FeatureIndexFiltersSchema.optional(),
  nearby: z
    .object({
      coordinates: z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
      excludeId: z.string().optional(),
    })
    .optional(),
  q: z.string().trim().max(200).optional(),
  includeCount: z.boolean().default(true),
  idsOnly: z.boolean().default(false),
  summaryOnly: z.boolean().optional(),
  pagination: z
    .object({
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().nonnegative().default(0),
    })
    .optional(),
  sorting: z
    .object({
      sortBy: z.enum([
        'id',
        'modifiedAt',
        'createdAt',
        'title',
        'description',
        'displayAddress',
      ]),
      sortOrder: z.enum(['asc', 'desc']),
    })
    .optional(),
})

export type FeatureIndexFilters = z.infer<typeof FeatureIndexFiltersSchema>
export type FeatureIndexQuery = z.input<typeof FeatureIndexQuerySchema>
export type FeatureIndexPage<T = Feature> = {
  data: T[]
  totalCount: number | null
  hasMore: boolean
  nextOffset: number | null
}
