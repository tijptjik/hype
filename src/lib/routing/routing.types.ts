// VALIDATION
import { z } from 'zod'
// TYPES
import type { LineString, MultiLineString, Point } from 'geojson'

const routingModeSchema = z.enum(['pedestrian', 'bicycle', 'motor_scooter', 'auto'])
export type RoutingMode = z.infer<typeof routingModeSchema>
const modeLabels: Record<RoutingMode, string> = {
  pedestrian: 'Walk',
  bicycle: 'Cycle',
  motor_scooter: 'Scooter',
  auto: 'Car',
}
/** Shared street-profile registry for validation, mode types and UI choices. */
export const ROUTING_MODES = routingModeSchema.options.map(id => ({
  id,
  label: modeLabels[id],
}))

export const routingPointSchema = z.object({
  lat: z.number().finite().min(22.1).max(22.6),
  lon: z.number().finite().min(113.8).max(114.5),
})
export const routingRequestSchema = z.object({
  origin: routingPointSchema,
  destination: routingPointSchema,
  mode: routingModeSchema,
})

export type RoutingPoint = z.infer<typeof routingPointSchema>
export type RoutingRequest = z.infer<typeof routingRequestSchema>
export type RoutingDestination = RoutingPoint & { title: string }
export type JourneySegment = {
  geometry: LineString | Point
  instruction: string
  seconds: number
  metres: number
  mode: RoutingMode
}
export type Journey = {
  geometry: MultiLineString
  mode: RoutingMode
  seconds: number
  metres: number
  cost: { currency: 'HKD'; amount: number | null }
  segments: JourneySegment[]
  calculatedAt: string
  hasFerry: boolean
}
