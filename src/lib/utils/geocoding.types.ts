// TYPES
import type { AddressProperties, AddressMeta } from '$lib/utils/address.types'
import type { LocaleKey } from '$lib/types'

/* ----------------- */
// GEOCODING
/* -------- */

export type ParsedReverseGeocodeResultI18n = {
  displayAddress: string | undefined | null
  displayAddressGen: boolean
  addressProperties: Partial<AddressProperties>
}

// IDENTIFY RESULT
export interface ParsedReverseGeocodeResult {
  addressMeta: AddressMeta
  i18n: Record<LocaleKey, ParsedReverseGeocodeResultI18n>
}

// ALS RESULT
// Data Dictionary is available at:
// https://www.als.gov.hk/docs/Data_Dictionary_for_ALS_EN-v3.2.pdf
export interface ALSResult {
  // Input address information provided in the search request
  RequestAddress: {
    AddressLine: string[]
  }
  // List of suggested addresses that match the search criteria
  SuggestedAddress?: Array<{
    Address: {
      PremisesAddress: {
        // English address components
        EngPremisesAddress: {
          // Building/Block information
          EngBlock: {
            BlockDescriptor: string // Block type (e.g., "BLK", "TOWER")
            BlockNo: string // Block number
            BlockDescriptorPrecedenceIndicator: string // Whether BlockDescriptor appears before BlockNo
          }
          BuildingName: string // English name of the building
          // Estate information
          EngEstate: {
            EstateName: string // English name of the estate
            EngPhase?: {
              // Optional phase information
              PhaseName?: string
              PhaseNo?: string
            }
          }
          // Street information
          EngStreet: {
            StreetName: string // English street name
            BuildingNoFrom: string // Starting street number
            BuildingNoTo?: string // Optional ending street number
            EngVillage?: {
              LocationName: string
            }
          }
          // District information
          EngDistrict: {
            DcDistrict: string // English district name
          }
          Region: 'HK' | 'KLN' | 'NT' // Area code (HK/KLN/NT)
        }
        // Chinese address components
        ChiPremisesAddress: {
          // Building/Block information
          ChiBlock: {
            BlockDescriptor: string // Block type in Chinese (e.g., "座", "樓")
            BlockNo: string // Block number
            BlockDescriptorPrecedenceIndicator?: string
          }
          BuildingName: string // Chinese name of the building
          // Estate information
          ChiEstate: {
            EstateName: string // Chinese name of the estate
            ChiPhase?: {
              // Optional phase information
              PhaseName?: string
              PhaseNo?: string
            }
          }
          // Street information
          ChiStreet: {
            StreetName: string // Chinese street name
            BuildingNoFrom: string // Starting street number
            BuildingNoTo?: string // Optional ending street number
          }
          // District information
          ChiDistrict: {
            DcDistrict: string // Chinese district name
          }
          Region: '香港' | '九龍' | '新界' // Area in Chinese
        }
        // Unique identifier for the address
        GeoAddress: string // Unique address reference number
        // Spatial coordinates
        GeospatialInformation: {
          Northing: string // HK1980 Grid Northing
          Easting: string // HK1980 Grid Easting
          Latitude: string // WGS84 latitude
          Longitude: string // WGS84 longitude
        }
      }
    }
    // Address matching confidence
    ValidationInformation: {
      Score: number // Confidence score (0-100)
    }
  }>
}

export type Neighbourhood = {
  neighbourhood: string
  data: {
    neighbourhood: string
    area: string
    district: string
  }
}
