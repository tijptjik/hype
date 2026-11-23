export type BrandLocationViewState = {
  q: string
  category: string
  hype: boolean | null
  upstream: boolean | null
  linked: boolean | null
  filters: boolean
  map: boolean
}

/** Read a three-way filter without confusing an omitted value with the neutral state.
 * @param value URL value. @param fallback Default when absent or invalid.
 * @returns The decoded filter.
 */
function triState(value: string | null, fallback: boolean | null): boolean | null {
  return value === 'yes'
    ? true
    : value === 'no'
      ? false
      : value === 'all'
        ? null
        : fallback
}

/** Restore discovery controls, retaining explicit empty search/category values.
 * @param params URL query. @param defaults Brand-specific search defaults.
 * @returns Validated view state.
 */
export function readBrandLocationUrl(
  params: Pick<URLSearchParams, 'get'>,
  defaults: { q: string; category: string },
): BrandLocationViewState {
  return {
    q: (params.get('q') ?? defaults.q).slice(0, 200),
    category: params.get('category') ?? defaults.category,
    hype: triState(params.get('hype'), false),
    upstream: triState(params.get('upstream'), null),
    linked: triState(params.get('linked'), null),
    filters: params.get('filters') !== 'hidden',
    map: params.get('view') === 'map',
  }
}

/** Write shareable controls while preserving route, organisation and unrelated parameters.
 * @param url Current URL. @param state Current discovery controls.
 * @returns A new URL suitable for shallow replacement, without another navigation.
 */
export function writeBrandLocationUrl(
  url: Pick<URL, 'href'>,
  state: BrandLocationViewState,
): URL {
  const next = new URL(url.href)
  next.searchParams.set('q', state.q)
  next.searchParams.set('category', state.category)
  for (const field of ['hype', 'upstream', 'linked'] as const)
    next.searchParams.set(
      field,
      state[field] === null ? 'all' : state[field] ? 'yes' : 'no',
    )
  next.searchParams.set('filters', state.filters ? 'shown' : 'hidden')
  next.searchParams.set('view', state.map ? 'map' : 'list')
  return next
}
