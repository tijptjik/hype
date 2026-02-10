// ZOD
import { z } from 'zod'

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
    })
    .optional(),
  q: z.string().trim().optional(),
})
