import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

import type { Locale } from '$lib/types'

export type StyleBuildOptions = {
  noLabels?: boolean
  locale?: Locale
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
  locale: Locale,
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

  const currentNameExpression: unknown[] = ['case', ['get', 'name'], ['get', 'name']]

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

const toProtomapsLang = (locale: Locale): string => {
  switch (locale) {
    case 'zh-hans':
      return 'zh-Hans'
    case 'zh-hant':
      return 'zh-Hant'
    default:
      return 'en'
  }
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
          lang: toProtomapsLang(locale),
        },
  ) as StyleSpecification['layers']

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
