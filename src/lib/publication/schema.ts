// SCHEMA
import { z } from 'zod'

/** Explicit saved publication intent. Authorization is always resolved by the server. */
export const PublicationPreviewSchema = z.object({
  type: z.enum(['organisation', 'project', 'layer']),
  id: z.string().trim().min(1).max(128),
  publishChildren: z.boolean(),
})
