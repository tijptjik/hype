import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

import { toProtomapLocale } from '$lib/i18n'
import type { LocaleKey } from '../../../types'

export type StyleBuildOptions = {
  noLabels?: boolean
  locale?: LocaleKey
}

export const MAP_STYLE_VARIANTS = [
  'light',
  'dark',
  'white',
  'grayscale',
  'black',
] as const

export type MapStyleVariant = (typeof MAP_STYLE_VARIANTS)[number]

export type MapStyleDefinition<TCode extends string = string> = {
  key: TCode
  label: string
  description: string
  basemapVariant: MapStyleVariant | null
  showSymbols: boolean
  buildStyle: (options?: StyleBuildOptions) => StyleSpecification
}

export const BASE_VECTOR_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'hongkong-latest': {
      type: 'vector',
      url: 'https://tiles.hype.hk/basemap/hongkong-latest.json',
    },
  },
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
  layers: [],
}

export const NAMED_PROTOMAPS_FLAVORS = [
  'light',
  'dark',
  'white',
  'grayscale',
  'black',
] as const

export type NamedProtomapsFlavor = (typeof NAMED_PROTOMAPS_FLAVORS)[number]

export const cloneStyle = (style: StyleSpecification): StyleSpecification =>
  structuredClone(style)

export const hideSymbolLayers = (style: StyleSpecification): StyleSpecification => {
  if (!style.layers) {
    return style
  }

  style.layers = style.layers.map(layer =>
    layer.type === 'symbol'
      ? {
          ...layer,
          layout: {
            ...(layer.layout ?? {}),
            visibility: 'none',
          },
        }
      : layer,
  )

  return style
}

export const getLocaleTextField = (
  layerId: string,
  locale: LocaleKey,
): unknown[] | undefined => {
  if (layerId === 'address_label') {
    return ['get', 'addr_housenumber']
  }

  if (
    !layerId.startsWith('places_') &&
    !layerId.startsWith('roads_labels_') &&
    layerId !== 'pois' &&
    layerId !== 'water_waterway_label'
  ) {
    return undefined
  }

  const currentNameExpression: unknown[] = [
    'coalesce',
    ['get', 'name'],
    ['get', 'pgf:name'],
  ]

  const englishNameExpression: unknown[] =
    locale === 'en'
      ? [
          'coalesce',
          ['get', 'name:en'],
          ['get', 'name_en'],
          ['get', 'name2'],
          ['get', 'pgf:name2'],
        ]
      : [
          'coalesce',
          ['get', 'name:en'],
          ['get', 'name_en'],
          ['get', 'name2'],
          ['get', 'pgf:name2'],
        ]

  const localNameExpression: unknown[] = [
    'coalesce',
    currentNameExpression,
    ['get', 'pgf:name'],
  ]

  return [
    'case',
    [
      'all',
      ['!=', englishNameExpression, ''],
      ['!=', localNameExpression, ''],
      ['!=', englishNameExpression, localNameExpression],
    ],
    ['format', englishNameExpression, {}, '\n', {}, localNameExpression, {}],
    ['coalesce', englishNameExpression, localNameExpression],
  ]
}

export const buildNamedProtomapsStyle = (
  flavorName: NamedProtomapsFlavor,
  { noLabels = false, locale = 'en' }: StyleBuildOptions = {},
): StyleSpecification => {
  const style = cloneStyle(BASE_VECTOR_STYLE)

  style.layers = layers(
    'hongkong-latest',
    namedFlavor(flavorName),
    noLabels
      ? undefined
      : {
          lang: toProtomapLocale(locale),
        },
  ) as StyleSpecification['layers']

  // Protomaps' v4 sprite set does not ship a dedicated `townhall` icon.
  // Route that POI kind through the existing `building` sprite to avoid runtime
  // style-image missing errors during symbol placement.
  style.layers = style.layers?.map(layer => {
    if (layer.id !== 'pois' || layer.type !== 'symbol') {
      return layer
    }

    const iconImage = layer.layout?.['icon-image']
    if (!Array.isArray(iconImage)) {
      return layer
    }

    return {
      ...layer,
      layout: {
        ...(layer.layout ?? {}),
        'icon-image': [
          'match',
          ['get', 'kind'],
          'station',
          'train_station',
          'townhall',
          'building',
          ['get', 'kind'],
        ],
      },
    }
  })

  return style
}

export const applySpriteVariant = (
  style: StyleSpecification,
  options: {
    basemapVariant: MapStyleVariant | null
    showSymbols: boolean
  },
): StyleSpecification => {
  if (
    !options.showSymbols ||
    (options.basemapVariant !== 'light' && options.basemapVariant !== 'dark')
  ) {
    delete style.sprite
    return style
  }

  style.sprite = `https://protomaps.github.io/basemaps-assets/sprites/v4/${options.basemapVariant}`
  return style
}
