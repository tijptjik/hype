import { toLocaleKebab } from '$lib/i18n'
import { supportedLocaleKeys } from '../../enums'
import * as m from '../../paraglide/messages.js'

import type { Locale, LocaleKey, MapStyleCatalogKey } from '../../types'

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
    case 'hyper':
      return {
        name: m.map_style__hyper_name({}, { locale }),
        description: m.map_style__hyper_description({}, { locale }),
      }
    case 'hyperLight':
      return {
        name: m.map_style__hyper_light_name({}, { locale }),
        description: m.map_style__hyper_light_description({}, { locale }),
      }
    case 'ghostery':
      return {
        name: m.map_style__ghostery_name({}, { locale }),
        description: m.map_style__ghostery_description({}, { locale }),
      }
    case 'ghostery-legacy':
      return {
        name: m.map_style__ghostery_legacy_name({}, { locale }),
        description: m.map_style__ghostery_legacy_description({}, { locale }),
      }
    case 'breadline':
      return {
        name: m.map_style__breadline_name({}, { locale }),
        description: m.map_style__breadline_description({}, { locale }),
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
