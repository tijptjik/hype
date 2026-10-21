// VALIDATION
import { z } from 'zod'

/** SaanSeoi/Overture operating vocabulary; absence means unknown, never open. */
export const OPERATING_STATUSES = [
  'open',
  'temporarily_closed',
  'permanently_closed',
] as const
export const OperatingStatusSchema = z.enum(OPERATING_STATUSES)
export type OperatingStatus = z.infer<typeof OperatingStatusSchema>

/** Physical buildings have no business operating status. */
export const BUILDING_STATUSES = ['standing', 'demolished'] as const
export const BuildingStatusSchema = z.enum(BUILDING_STATUSES)
export type BuildingStatus = z.infer<typeof BuildingStatusSchema>
