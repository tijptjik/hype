// THIRD-PARTY
import { describe, expect, it } from 'vitest'
// NAVIGATION
import { parsePublicationPreview } from '#lib/publication/preview.js'
import { getAdminMapHref, getMapPrisms } from '#lib/navigation/adminMapLink.js'

describe('admin map navigation', () => {
  const prisms = { organisation: ['org'], project: ['one', 'two'], layer: ['a', 'b'] }

  it('opens the active feature and transfers every prism', () => {
    const url = new URL(
      getAdminMapHref(prisms, 'feature', 'feature-id'),
      'https://hype.test',
    )
    expect(url.pathname).toBe('/features/feature-id')
    expect(getMapPrisms(url.searchParams)).toEqual(prisms)
  })

  it('targets a hierarchy resource without discarding other selections', () => {
    const url = new URL(getAdminMapHref(prisms, 'layer', 'c'), 'https://hype.test')
    expect(url.pathname).toBe('/')
    expect(getMapPrisms(url.searchParams)?.layer).toEqual(['a', 'b', 'c'])
  })

  it.each([
    { featureId: 'linked-feature' },
    { feature: { id: 'linked-feature' } },
    { featureId: 'linked-feature', feature: { id: 'stale-feature' } },
  ])('opens the feature associated with a loaded task: %j', task => {
    const url = new URL(
      getAdminMapHref(prisms, 'task', 'task-id', task),
      'https://hype.test',
    )
    expect(url.pathname).toBe('/features/linked-feature')
    expect(getMapPrisms(url.searchParams)).toEqual(prisms)
  })

  it('does not reuse a task feature after navigating to an index', () => {
    expect(
      getAdminMapHref(prisms, 'task', false, { featureId: 'old-feature' }),
    ).toMatch(/^\/\?/)
  })

  it.each([
    ['feature', false],
    ['feature', 'new'],
    ['task', 'task-id'],
  ] as const)('falls back to the map for %s %s', (type, ref) => {
    expect(getAdminMapHref(prisms, type, ref)).toMatch(/^\/\?/)
  })

  it('distinguishes explicit empty scope from an ordinary map visit', () => {
    const empty = { organisation: [], project: [], layer: [] }
    const url = new URL(getAdminMapHref(empty, false, false), 'https://hype.test')
    expect(getMapPrisms(url.searchParams)).toEqual(empty)
    expect(getMapPrisms(new URLSearchParams())).toBeNull()
  })
})

it.each([true, false])(
  'uses preview only for an unpublished saved feature (%s)',
  isPublished => {
    const url = new URL(
      getAdminMapHref(
        { organisation: [], project: [], layer: [] },
        'feature',
        'saved',
        null,
        { id: 'saved', isPublished },
      ),
      'https://hype.test',
    )
    expect(url.pathname).toBe('/features/saved')
    expect(parsePublicationPreview(url.searchParams)).toEqual(
      isPublished ? null : { type: 'feature', id: 'saved', publishChildren: false },
    )
  },
)

describe('Location map context', () => {
  const prisms = { organisation: ['org'], project: [], layer: [] }
  const location = {
    id: 'part',
    indoorSource: { href: '/premises/kowloon-tong-mtr/places/polygon-id' },
    premisesMap: { href: '/premises/kowloon-tong-mtr' },
    facts: { location: { geometry: { coordinates: [114.177, 22.3369] } } },
  } as import('#lib/locations/resource.js').LocationResource

  it('opens an exact polygon before the containing map', () => {
    expect(getAdminMapHref(prisms, 'location', 'part', null, null, location)).toBe(
      location.indoorSource?.href,
    )
    expect(
      getAdminMapHref(prisms, 'location', 'part', null, null, {
        ...location,
        indoorSource: null,
      }),
    ).toBe(location.premisesMap?.href)
  })

  it('centres ordinary Locations and preserves hierarchy selections', () => {
    const url = new URL(
      getAdminMapHref(prisms, 'location', 'part', null, null, {
        ...location,
        indoorSource: null,
        premisesMap: null,
      }),
      'https://hype.test',
    )
    expect(url.searchParams.get('lng')).toBe('114.177')
    expect(url.searchParams.get('lat')).toBe('22.3369')
    expect(url.searchParams.get('zoom')).toBe('18')
    expect(getMapPrisms(url.searchParams)).toEqual(prisms)
  })

  it('never uses stale Location context for another record or the index', () => {
    for (const ref of ['other', false, 'new'] as const) {
      const url = new URL(
        getAdminMapHref(prisms, 'location', ref, null, null, location),
        'https://hype.test',
      )
      expect(url.pathname).toBe('/')
      expect(url.searchParams.has('lng')).toBe(false)
    }
  })
})
