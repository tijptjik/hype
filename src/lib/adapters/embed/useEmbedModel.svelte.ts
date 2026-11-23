// SVELTE
import { onMount } from 'svelte'
// EMBED
import { parseEmbedConfig, initialActiveLayers } from '#lib/embed/config.js'
// PROPERTY FILTERS
import {
  isRangeProperty,
  normalizeRangeValue,
  RangeValueSchema,
} from '#lib/properties/range.js'
// TYPES
import type { ThemeId } from '#lib/themes/themes.types.js'
import type { EmbedPayload } from '#lib/embed/embed.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
// PROPERTY SELECTION
import { displayPropertyValueIds } from '#lib/properties/selection.js'

/** Owns anonymous embed loading and visitor-local narrowing.
 * @param url Initial embed URL. @returns Reactive map state and retry controls.
 * @remarks Visitor preferences stay in memory. Aborted loads cannot overwrite a newer configuration.
 */
export function useEmbedModel(url: URL) {
  let payload = $state<EmbedPayload | null>(null)
  let features = $state.raw<FeatureFromCollection[]>([])
  let loading = $state(true)
  let failure = $state('')
  let active = $state<string[]>([])
  let divisions = $state<string[]>([])
  let categories = $state<string[]>([])
  let ranges = $state<Record<string, [number, number]>>({})
  let selected = $state<string | null>(null)
  let controller: AbortController | null = null
  let initial = $state.raw<FeatureFromCollection[]>([])
  let lang = $state<'en' | 'zh-Hant' | 'zh-Hans'>('en')
  let theme = $state<ThemeId>('hype-light')
  /** Loads every bounded page within the same explicit scope.
   * @returns Completion after all pages arrive or a visible error occurs.
   */
  async function load(): Promise<void> {
    controller?.abort()
    const request = new AbortController()
    controller = request
    loading = true
    failure = ''
    features = []
    payload = null
    initial = []
    try {
      const config = parseEmbedConfig(url.searchParams)
      lang = config.lang
      theme = config.theme
      const endpoint = new URL('/api/embed', url)
      endpoint.search = url.search
      let cursor: string | null = null
      const collected: FeatureFromCollection[] = []
      do {
        if (cursor) endpoint.searchParams.set('cursor', cursor)
        const response = await fetch(endpoint, {
          credentials: 'omit',
          signal: request.signal,
        })
        if (!response.ok) throw new Error('Map could not be loaded')
        const next = (await response.json()) as EmbedPayload
        if (request.signal.aborted) return
        if (!payload) {
          payload = next
          active = initialActiveLayers(
            config,
            next.layers.map(row => row.id),
          )
        }
        collected.push(...next.page.data)
        cursor = next.page.nextCursor?.id ?? null
      } while (cursor)
      features = collected
      initial = collected.filter(row => active.includes(row.layerId))
    } catch (reason) {
      if (!request.signal.aborted) failure = String(reason)
    } finally {
      if (!request.signal.aborted) loading = false
    }
  }
  onMount(() => {
    void load()
    return () => controller?.abort()
  })
  const visible = $derived(
    features.filter(
      row =>
        active.includes(row.layerId) &&
        Object.entries(ranges).every(([key, [min, max]]) => {
          const prefix = `${row.layerId}:`
          if (!key.startsWith(prefix)) return true
          const propertyId = key.slice(prefix.length)
          return row.properties.some(item => {
            if (item.propertyId !== propertyId) return false
            if (item.property && isRangeProperty(item.property)) {
              try {
                const raw = normalizeRangeValue(item.property, item.valueJson)
                if (!raw) return false
                const interval = RangeValueSchema.parse(JSON.parse(raw))
                return interval.start <= max && interval.end >= min
              } catch {
                return false
              }
            }
            return (
              item.value !== null &&
              item.value !== '' &&
              Number.isFinite(Number(item.value)) &&
              Number(item.value) >= min &&
              Number(item.value) <= max
            )
          })
        }) &&
        (!divisions.length ||
          row.divisionMemberships?.some(
            item => item.selected && divisions.includes(item.divisionId),
          )) &&
        (!categories.length ||
          [...new Set(categories.map(key => key.split(':')[0]))].every(propertyId =>
            row.properties.some(
              item =>
                item.propertyId === propertyId &&
                displayPropertyValueIds(item).some(id =>
                  categories.includes(`${item.propertyId}:${id}`),
                ),
            ),
          )),
    ),
  )
  return {
    get payload() {
      return payload
    },
    get features() {
      return features
    },
    get initial() {
      return initial
    },
    get visible() {
      return visible
    },
    get loading() {
      return loading
    },
    get failure() {
      return failure
    },
    get active() {
      return active
    },
    set active(value) {
      active = value
    },
    get divisions() {
      return divisions
    },
    set divisions(value) {
      divisions = value
    },
    get ranges() {
      return ranges
    },
    set ranges(value) {
      ranges = value
    },
    get categories() {
      return categories
    },
    set categories(value) {
      categories = value
    },
    get lang() {
      return lang
    },
    set lang(value) {
      lang = value
    },
    get theme() {
      return theme
    },
    set theme(value) {
      theme = value
    },
    get selected() {
      return visible.find(row => row.id === selected) ?? null
    },
    select(id: string | null): void {
      selected = id
    },
    load,
  }
}
