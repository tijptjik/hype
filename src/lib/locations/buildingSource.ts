// VALIDATION
import { z } from 'zod'

/** Public export identity, independent of SaanSeoi Places ssIDs and Address IDs. */
export const BuildingSourceSchema = z.strictObject({
  id: z.string().min(1).max(200),
  release: z.string().min(1).max(200),
  addressId: z.string().min(1).max(200).optional(),
})
export type BuildingSource = z.infer<typeof BuildingSourceSchema>
