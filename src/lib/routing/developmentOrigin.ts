// TYPES
import type { RoutingPoint } from './routing.types.js'

type MockOrigin = RoutingPoint & { label: string }

/**
 * Local routing origin requested for navigation development; production uses GPS.
 * Government address lookup: 132–134 Hollywood Road / 1 Square Street, Tai Hing Hse.
 * Source: https://www.als.gov.hk/lookup?q=132%20Hollywood%20Road&n=3
 */
export const developmentOrigin: MockOrigin | null = import.meta.env.DEV
  ? {
      lat: 22.28411,
      lon: 114.14991,
      label: 'Tai Hing House, Sheung Wan (mock location)',
    }
  : null
