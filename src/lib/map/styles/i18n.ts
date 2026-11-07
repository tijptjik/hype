import { toLocaleKebab } from '#lib/i18n.js'
import { supportedLocaleKeys } from '../../enums'
import * as m from '#lib/paraglide/messages.js'

import type { Locale, LocaleKey } from '#lib/types.js'
import type { MapStyleCatalogKey } from './catalog'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. COPY RESOLUTION
//    - getMapStyleCatalogCopy
//    - getMapStyleCatalogI18n

type MapStyleCopy = {
  name: string
  description: string
}

/**
 * Resolves localized copy for one built-in map style.
 *
 * @param key - Built-in map style catalog key.
 * @param localeKey - Locale key to resolve copy for.
 * @returns Localized name/description pair.
 */
export const getMapStyleCatalogCopy = (
  key: MapStyleCatalogKey,
  localeKey: LocaleKey,
): MapStyleCopy => {
  const locale = toLocaleKebab(localeKey)

  switch (key) {
    case 'noclit25':
      return {
        name: "NocLit'25",
        description:
          localeKey === 'en'
            ? 'Navy water, blue city blocks and orange streets inspired by the 2025 European Literature Night poster.'
            : localeKey === 'zhHant'
              ? '以2025歐洲文學之夜海報為靈感，呈現深藍水域、藍色城市與橙色街道。'
              : '以2025欧洲文学之夜海报为灵感，呈现深蓝水域、蓝色城市与橙色街道。',
      }
    case 'noclit26':
      return {
        name: "NocLit'26",
        description:
          localeKey === 'en'
            ? 'Flat red city blocks, black streets and quiet grey water. A quiet stage for literature-night books and venues.'
            : localeKey === 'zhHant'
              ? '磚紅城市、炭黑街道與灰色水域，讓文學之夜的書籍與場地成為焦點。'
              : '砖红城市、炭黑街道与灰色水域，让文学之夜的书籍与场地成为焦点。',
      }
    case 'hype-dark':
      return {
        name: m.map_style__hyper_name({}, { locale }),
        description: m.map_style__hyper_description({}, { locale }),
      }
    case 'hype-light':
      return {
        name: m.map_style__hyper_light_name({}, { locale }),
        description: m.map_style__hyper_light_description({}, { locale }),
      }
    case 'hyperpop':
      return {
        name: m.map_style__hyperpop_name({}, { locale }),
        description: m.map_style__hyperpop_description({}, { locale }),
      }
    case 'ghostery':
      return {
        name: m.map_style__ghostery_name({}, { locale }),
        description: m.map_style__ghostery_description({}, { locale }),
      }
    case 'neorange':
      return {
        name: m.map_style__neorange_name({}, { locale }),
        description: m.map_style__neorange_description({}, { locale }),
      }
    case 'genesis':
      return {
        name: m.map_style__genesis_name({}, { locale }),
        description: m.map_style__genesis_description({}, { locale }),
      }
    case 'sin':
      return {
        name: m.map_style__sin_name({}, { locale }),
        description: m.map_style__sin_description({}, { locale }),
      }
    case 'rosepunk':
      return {
        name: m.map_style__rosepunk_name({}, { locale }),
        description: m.map_style__rosepunk_description({}, { locale }),
      }
    case 'midnight':
      return {
        name: m.map_style__midnight_name({}, { locale }),
        description: m.map_style__midnight_description({}, { locale }),
      }
    case 'breadline-dark':
      return {
        name: m.map_style__breadline_dark_name({}, { locale }),
        description: m.map_style__breadline_dark_description({}, { locale }),
      }
    case 'breadline-light':
      return {
        name: m.map_style__breadline_light_name({}, { locale }),
        description: m.map_style__breadline_light_description({}, { locale }),
      }
    case 'protomaps-light':
      return {
        name: m.map_style__protomaps_light_name({}, { locale }),
        description: m.map_style__protomaps_light_description({}, { locale }),
      }
    case 'protomaps-dark':
      return {
        name: m.map_style__protomaps_dark_name({}, { locale }),
        description: m.map_style__protomaps_dark_description({}, { locale }),
      }
    case 'protomaps-white':
      return {
        name: m.map_style__protomaps_white_name({}, { locale }),
        description: m.map_style__protomaps_white_description({}, { locale }),
      }
    case 'protomaps-grayscale':
      return {
        name: m.map_style__protomaps_grayscale_name({}, { locale }),
        description: m.map_style__protomaps_grayscale_description({}, { locale }),
      }
    case 'protomaps-black':
      return {
        name: m.map_style__protomaps_black_name({}, { locale }),
        description: m.map_style__protomaps_black_description({}, { locale }),
      }
    case 'hyperAdmin':
      return {
        name: m.map_style__hyper_admin_name({}, { locale }),
        description: m.map_style__hyper_admin_description({}, { locale }),
      }
  }
}

/**
 * Resolves localized copy for every supported locale for one built-in map style.
 *
 * @param key - Built-in map style catalog key.
 * @returns DB-locale-keyed map-style copy.
 */
export const getMapStyleCatalogI18n = (
  key: MapStyleCatalogKey,
): Record<Locale, MapStyleCopy> =>
  Object.fromEntries(
    supportedLocaleKeys.map(localeKey => [
      toLocaleKebab(localeKey),
      getMapStyleCatalogCopy(key, localeKey),
    ]),
  ) as Record<Locale, MapStyleCopy>
