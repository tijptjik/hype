// ZOD
import { z } from 'zod'

export const RequestMetaSchema = z
  .object({
    isAdminRequest: z.boolean().optional(),
    profile: z
      .enum(['compact', 'default', 'map', 'full', 'admin', 'list', 'card', 'detail'])
      .optional(),
  })
  .optional()

/* ----------------- */
// API :: QUERY PARAM SCHEMAS
/* -------- */

export const ListQueryParamsSchema = z.object({
  conditions: z.record(z.string(), z.unknown()).optional(),
  prisms: z
    .object({
      organisation: z.array(z.string()).optional(),
      project: z.array(z.string()).optional(),
      layer: z.array(z.string()).optional(),
    })
    .optional(),
  pagination: z
    .object({
      limit: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().optional(),
      afterId: z.string().min(1).optional(),
      afterValue: z.union([z.string(), z.number(), z.null()]).optional(),
    })
    .optional(),
  sorting: z
    .object({
      sortBy: z.string().trim().min(1).optional(),
      sortOrder: z.enum(['asc', 'desc']).optional(),
    })
    .optional(),
  q: z.string().trim().optional(),
  meta: RequestMetaSchema,
})

export const GetQueryParamsSchema = z.object({
  ref: z.string(),
  refKey: z.enum(['id', 'code']).optional(),
  meta: RequestMetaSchema,
})

/** Public identity sufficient for a breadcrumb, without a hydrated ancestor graph. */
export const CompactAncestorSchema = z.object({
  id: z.string(),
  code: z.string(),
  i18n: z.record(
    z.string(),
    z.object({ name: z.string().nullish(), nameShort: z.string().nullish() }),
  ),
})
export const CompactAncestorsSchema = z.object({
  organisation: CompactAncestorSchema.nullish(),
  project: CompactAncestorSchema.extend({
    useAllInOrgContext: z.boolean().default(false),
  }).nullish(),
})
