// SOURCE ADAPTER
import { adaptLandsD } from './navigation/landsd'
import { value, type IndoorData, type IndoorFeature, type Place } from './model'
export { contains } from './navigation/geometry'
export type RoutePoint = { point: [number, number]; level: string }
export type IndoorRoute = {
  points: RoutePoint[]
  metres: number
  entrance: string
  destination: string
  targetId: string
  requiresPaidAccess: boolean
  connectionIds: string[]
}
const sessions = new WeakMap<IndoorData, ReturnType<typeof adaptLandsD>>()
/** Retrieves the source adapter and reusable floor graphs for one immutable snapshot. @param data Snapshot. @returns Navigation session. */
export function indoorNavigation(data: IndoorData): ReturnType<typeof adaptLandsD> {
  let session = sessions.get(data)
  if (!session) {
    session = adaptLandsD(data)
    sessions.set(data, session)
  }
  return session
}
/** Routes through independent floors using declared connections, preferring unpaid space.
 * @param data Source snapshot. @param entrance Source origin. @param target Destination place.
 * @returns Preview route or null where the network is incomplete.
 * @remarks Paid fallback requires explicit faregate connections. Unknown access and display-only candidates are excluded.
 */
export async function findIndoorRoute(
  data: IndoorData,
  entrance: IndoorFeature,
  target: Place,
): Promise<IndoorRoute | null> {
  const navigation = indoorNavigation(data)
  const route = await navigation.router.route(
    navigation.endpoint(entrance, value(entrance.properties, 'level_id')),
    navigation.endpoint(
      target.feature,
      target.levelId,
      target.feature.geometry.type === 'Point' ? undefined : target.id,
    ),
  )
  if (!route) return null
  return {
    ...route,
    points: route.points.map(p => ({
      point: navigation.world(p.point),
      level: p.floorId,
    })),
    entrance: value(entrance.properties, 'amenity_name_en'),
    destination: `${target.name.en} ${target.code}`.trim(),
    targetId: target.id,
  }
}
