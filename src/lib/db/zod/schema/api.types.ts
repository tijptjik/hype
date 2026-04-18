import type { z } from 'zod'
import type {
  GetQueryParamsSchema,
  ListQueryParamsSchema,
  RequestMetaSchema,
} from '$lib/db/zod/schema/api'

export type RequestMeta = z.infer<typeof RequestMetaSchema>
export type ListQueryParams = z.infer<typeof ListQueryParamsSchema>
export type GetQueryParams = z.infer<typeof GetQueryParamsSchema>
