// Shared names for metadata and renderers, without the basemap runtime.
export const NAMED_PROTOMAPS_FLAVORS = [
  'light',
  'dark',
  'white',
  'grayscale',
  'black',
] as const

export type NamedProtomapsFlavor = (typeof NAMED_PROTOMAPS_FLAVORS)[number]
