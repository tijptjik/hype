// TYPES

/* ----------------- */
// NAVIGATION :: FACETS
/* -------- */

const Facets = [
  'core',
  'capabilities',
  'address',
  'images',
  'fields',
  'layers',
  'features',
  'policies',
  'advanced',
] as const

export type FacetType = (typeof Facets)[number]
