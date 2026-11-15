import type { IndoorFeature } from '../model'
import type { Point } from './geometry'

/** Navigation geometry uses a shared local metre coordinate system, never exploded-view offsets. */
export type Access = 'unpaid' | 'paid' | 'unknown'
export type NavigationArea = {
  id: string
  geometry: IndoorFeature
  access: Access
  /** Destination rooms may be entered but never used as shortcuts. */
  transit: boolean
}
export type AccessPoint = { id: string; areaId: string; point: Point }
export type Barrier = { id: string; from: Point; to: Point }
export type NavigationFloor = {
  id: string
  name: string
  elevation: number
  areas: NavigationArea[]
  accessPoints: AccessPoint[]
  barriers: Barrier[]
}
export type ConnectionEndpoint = { floorId: string; accessPointId: string }
export type NavigationConnection = {
  id: string
  from: ConnectionEndpoint
  to: ConnectionEndpoint
  kind: 'door' | 'passage' | 'faregate' | 'lift' | 'stairs' | 'escalator' | 'ramp'
  direction: 'both' | 'forward'
  evidence:
    | 'source-opening'
    | 'matching-lift-code'
    | 'reviewed-layout'
    | 'editor-verified'
    | 'candidate'
  sourceIds: string[]
  enabled: boolean
}
export type RouteEndpoint = { floorId: string; areaId?: string; point?: Point }
export type NavigationRoute = {
  points: { point: Point; floorId: string }[]
  metres: number
  requiresPaidAccess: boolean
  connectionIds: string[]
}
