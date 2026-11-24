// TYPES

/* ----------------- */
// NAVIGATION :: FACETS
/* -------- */

const Facets = [
  'core',
  'relationships',
  'interior',
  'exterior',
  'capabilities',
  'messaging',
  'users',
  'location',
  'updates',
  'images',
  'fields',
  'layers',
  'features',
  'policies',
  'advanced',
  'share',
] as const

export type FacetType = (typeof Facets)[number]
