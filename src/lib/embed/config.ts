// CATALOGUES
import { isMapStyleKey } from '#lib/map/styles/registry.js'
import { isThemeId } from '#lib/themes/themes.js'
// TYPES
import type { MapStyleKey } from '#lib/map/styles/registry.js'
import type { ThemeId } from '#lib/themes/themes.types.js'

export type EmbedCamera = [
  longitude: number,
  latitude: number,
  zoom: number,
  pitch?: number,
  bearing?: number,
]

export const embedLanguages = ['en', 'zh-Hant', 'zh-Hans'] as const
export type EmbedLanguage = (typeof embedLanguages)[number]

export type EmbedConfig = {
  hubs: string[]
  organisations: string[]
  projects: string[]
  layers: string[]
  excluded?: string[]
  active: string[] | null
  mapStyle: MapStyleKey
  theme: ThemeId
  lang: EmbedLanguage
  languages?: EmbedLanguage[]
  filters: boolean
  camera: EmbedCamera | null
}
export const scopeKeys = ['hubs', 'organisations', 'projects', 'layers'] as const

/** Parses a bounded comma-separated resource selection.
 * @param params URL parameters. @param key Parameter name. @returns Unique stable IDs.
 */
function ids(params: URLSearchParams, key: string): string[] {
  const values = [
    ...new Set(
      params
        .getAll(key)
        .flatMap(value => value.split(','))
        .filter(Boolean),
    ),
  ]
  if (values.length > 500 || values.some(value => !/^[\w:-]{1,100}$/.test(value)))
    throw new Error(`Invalid ${key}`)
  return values
}

/** Validates a saved map perspective while accepting existing three-coordinate links.
 * @param value Untrusted URL or preview message value. @returns Whether it is a supported camera.
 */
export function isEmbedCamera(value: unknown): value is EmbedCamera {
  return (
    Array.isArray(value) &&
    (value.length === 3 || value.length === 5) &&
    value.every(item => typeof item === 'number' && Number.isFinite(item)) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 85 &&
    value[2] >= 0 &&
    value[2] <= 22 &&
    (value.length === 3 ||
      (value[3] >= 0 && value[3] <= 85 && Math.abs(value[4]) <= 180))
  )
}

/** Validates shareable configuration independently of authentication.
 * @param params Untrusted URL parameters. @returns Normalized embed configuration.
 * @remarks Empty scope never means all resources. Empty active differs from omitted active.
 */
export function parseEmbedConfig(params: URLSearchParams): EmbedConfig {
  if (params.has('v') && params.get('v') !== '1')
    throw new Error('Unsupported embed version')
  const scope = {
    hubs: ids(params, 'hubs'),
    organisations: ids(params, 'organisations'),
    projects: ids(params, 'projects'),
    layers: ids(params, 'layers'),
  }
  if (!scopeKeys.some(key => scope[key].length))
    throw new Error('Select at least one map resource')
  const mapStyle = params.get('mapStyle') ?? 'hype-light'
  const theme = params.get('theme') ?? 'hype-light'
  const lang = params.get('lang') ?? 'en'
  if (!isMapStyleKey(mapStyle) || mapStyle === 'hyperAdmin')
    throw new Error('Invalid map style')
  if (!isThemeId(theme)) throw new Error('Invalid theme')
  if (!['en', 'zh-Hant', 'zh-Hans'].includes(lang)) throw new Error('Invalid language')
  const languages = params.has('languages')
    ? ids(params, 'languages')
    : [...embedLanguages]
  if (
    !languages.length ||
    languages.some(value => !embedLanguages.includes(value as EmbedLanguage)) ||
    !languages.includes(lang)
  )
    throw new Error('Primary language must be supported')
  let camera: EmbedConfig['camera'] = null
  if (params.has('view')) {
    const value = params.get('view')!.split(',').map(Number)
    if (!isEmbedCamera(value)) throw new Error('Invalid starting view')
    camera = value
  }
  return {
    ...scope,
    excluded: ids(params, 'exclude'),
    active: params.has('active') ? ids(params, 'active') : null,
    mapStyle,
    theme,
    lang: lang as EmbedConfig['lang'],
    languages: languages as EmbedLanguage[],
    // Neighbourhood and category filters are always available, including legacy links.
    filters: true,
    camera,
  }
}

/** Serializes the exact included set and initial visibility.
 * @param config Valid embed choices. @returns Relative public embed URL.
 */
export function embedUrl(config: EmbedConfig): string {
  const params = new URLSearchParams({ v: '1' })
  for (const key of scopeKeys)
    if (config[key].length) params.set(key, [...new Set(config[key])].sort().join(','))
  if (config.excluded?.length)
    params.set('exclude', [...new Set(config.excluded)].sort().join(','))
  if (config.active !== null)
    params.set('active', [...new Set(config.active)].sort().join(','))
  params.set('mapStyle', config.mapStyle)
  params.set('theme', config.theme)
  params.set('lang', config.lang)
  if (config.languages) params.set('languages', config.languages.join(','))
  if (config.camera) params.set('view', config.camera.join(','))
  return `/embed?${params}`
}

/** Intersects initial visibility with the available public set.
 * @param config Requested defaults. @param layerIds Available layers. @returns Initially visible layer IDs.
 */
export function initialActiveLayers(
  config: Pick<EmbedConfig, 'active'>,
  layerIds: string[],
): string[] {
  if (layerIds.length === 1) return [...layerIds]
  return config.active === null
    ? [...layerIds]
    : layerIds.filter(id => config.active!.includes(id))
}

/** Generates safely escaped responsive iframe markup.
 * @param url Absolute embed URL. @param title Accessible map description. @returns Copyable HTML.
 */
export function embedMarkup(url: string, title = 'Hype map'): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  return `<iframe src="${escapeHtml(url)}" title="${escapeHtml(title)}" loading="lazy" style="width:100%;height:600px;border:0" allowfullscreen></iframe>`
}
