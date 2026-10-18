// TYPES

/* ----------------- */
// FEATURES
/* -------- */

/* ----------------- */
// FEATURES :: DB
/* -------- */

/* ----------------- */
// FEATURES : ADDRESS
/* -------- */

export type AddressProperties = {
  // Suggested Display Address
  formattedAddress?: string
  // Source Address
  rawAddress?: string

  // ADDRESS COMPONENTS (sorted roughly from smallest to largest unit)

  // Division - e.g. front, roof, etc.
  unitPortion?: string
  // Internal Building Numbering - e.g. 4, 13C,
  unitNumber?: string
  // Internal Building Numbering Type - e.g. floor, unit, room, etc.
  unitType?: string
  // Floor Numbering - e.g. 1/F, 13/F store 1 and 13.
  floorNumber?: string
  // Floor Type - e.g. concourse, upper g/f, roof, etc.
  floorType?: string

  buildingName?: string
  buildingNumberFrom?: string
  buildingNumberTo?: string

  // Block Type - e.g. tower, block, etc.
  blockType?: string
  // Block Number - e.g. 1, F etc.
  blockNumber?: string
  // Block Type Before Number - e.g. Tower 1 of F Block
  blockTypeBeforeNumber?: boolean

  phaseName?: string
  phaseNumber?: string
  premisesName?: string

  streetName?: string
  streetAddress?: string
  intersection?: string

  // Outside of Settlements
  lotType?: string
  lotNumber?: string

  // Settlements
  hamlet?: string
  village?: string
  town?: string

  // City Divisions
  microhood?: string
  neighbourhood?: string
  macrohood?: string

  // Administrative Divisions
  district?: string | null
  area?: string | null
  country?: string | null
}

export type AddressMeta = {
  // IDENTIFIERS

  // IDENTIFIERS :: HKGOV
  // // Building Deparment CSUID
  geoAddressCode?: string

  // IDENTIFIERS :: GOOGLE
  // // Google Place ID
  googlePlaceId?: string
  // // Plus Code
  plusCode?: string

  // GEOSPATIAL
  longitude?: number
  latitude?: number

  // METRICS
  distanceFromPoint?: number
  confidenceForwardGeocoder?: number

  // GEOCODING
  addressForwardGeocoder?: 'hkgov_als' | 'googlemaps' | 'invalid'
  addressReverseGeocoder?: 'hkgov_reverse' | 'googlemaps'
  addressReverseGen?: boolean
  addressForwardGen?: boolean
}
