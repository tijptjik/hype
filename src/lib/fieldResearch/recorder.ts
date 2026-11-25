/** Mobile projections contain only the internal session label and visible location context. */
export type RecorderOption = { id: string; name: string }
export type RecorderSession = RecorderOption & {
  updatedAt: string
  completed: boolean
  captureIssue: string | null
  layers: RecorderOption[]
  defaultLayerId: string | null
}
export type RecorderLocation = RecorderPlace & {
  kind: 'premises' | 'building' | 'building_part'
  premises: RecorderPlace | null
  building: RecorderPlace | null
  iconPath: string | null
}

export type RecorderRecord = {
  id: string
  featureId: string | null
  title: string | null
  spatialRealm: SpatialRealm | null
  locationId: string | null
  pin: RecorderPin | null
}

export type SpatialRealm = 'interior' | 'exterior'
export type MapPoint = [number, number]
export type RecorderMap = RecorderOption & { hash: string; unitId: string | null }
export type RecorderPlace = RecorderOption & {
  address: string
  addressSortKey: string
  exteriorUrl: string | null
  maps: RecorderMap[]
  point: MapPoint | null
}
export type InteriorPin = {
  realm: 'interior'
  mapId: string
  hash: string
  floorId: string
  point: MapPoint
}
export type RecorderPin = InteriorPin | { realm: 'exterior'; point: MapPoint }
export type RecorderPlacement = {
  spatialRealm: SpatialRealm
  locationId: string | null
  pin: RecorderPin | null
}

/** Resolve drawings through explicit unit, building and premises links.
 * @param place Assigned location or one of its readable parents. @returns Specific unit links before whole-map links.
 */
export function recorderMaps(place: RecorderPlace | RecorderLocation): RecorderMap[] {
  return 'kind' in place
    ? [...place.maps, ...(place.building?.maps ?? []), ...(place.premises?.maps ?? [])]
    : place.maps
}
