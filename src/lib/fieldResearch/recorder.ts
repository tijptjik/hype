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
  premises: RecorderPlace | null
  building: RecorderPlace | null
  iconPath: string | null
}

/** Collect the addresses displayed on record cards from the session's vetted places.
 * @param places Assigned places and their readable building and premises context.
 * @returns Address by Location identity, including any address inherited by a building part.
 */
export function recorderLocationAddresses(
  places: RecorderLocation[],
): Map<string, string> {
  const addresses = new Map<string, string>()
  for (const place of places) {
    for (const item of [place.premises, place.building, place]) {
      if (item?.address) addresses.set(item.id, item.address)
    }
  }
  return addresses
}

export type RecorderRecord = {
  id: string
  featureId: string | null
  title: string | null
  identifierTags: string[]
  thumbnailRevision: string | null
  spatialRealm: SpatialRealm | null
  locationId: string | null
  pin: RecorderPin | null
}

export type SpatialRealm = 'interior' | 'exterior'
export type MapPoint = [number, number]
export type RecorderMap = RecorderOption & { hash: string; unitId: string | null }
export type RecorderPlace = RecorderOption & {
  kind: 'premises' | 'building' | 'building_part'
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
  point: MapPoint | null
  unitId?: string
  unitLabel?: string
  unitAddress?: string
  unitLocationId?: string
  unitCategory?: string
  /** Percent across and up the selected polygon's bounding box. */
  percent?: MapPoint
}
export type FacadePin = {
  realm: 'exterior'
  surface: 'facade'
  assetId: string
  geometryId: string
  facadeId: string
  direction: string
  /** Percent across and up the facade, independent of the displayed texture. */
  percent: MapPoint | null
  blend: number
  alignmentRevision: number
  floorId?: string
  floorLabel?: string
}
export type RecorderPin =
  | InteriorPin
  | FacadePin
  | { realm: 'exterior'; point: MapPoint }
export type RecorderPlacement = {
  spatialRealm: SpatialRealm | null
  locationId: string | null
  pin: RecorderPin | null
}

/** Resolve drawings through explicit unit, building and premises links.
 * @param place Assigned location or one of its readable parents. @returns Specific unit links before whole-map links.
 */
export function recorderMaps(place: RecorderPlace | RecorderLocation): RecorderMap[] {
  return 'building' in place
    ? [...place.maps, ...(place.building?.maps ?? []), ...(place.premises?.maps ?? [])]
    : place.maps
}
