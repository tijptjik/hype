import { describe, expect, it, vi } from 'vitest'
import {
  comparePlacePublications,
  discoverPlacePublication,
  parsePlacePublication,
} from '#lib/places/publication.js'

function document() {
  const meta = {
    apiReleaseSet: 'release-a',
    apiCatalogRevision: 'catalog-a',
    catalogPublishedAt: '2026-10-18T02:10:15.383Z',
    cohort: '2026-09-23.0',
    resolvedApiVersion: 'api-places-v0.1',
    domain: 'overture',
    region: 'hk',
  }
  const params = new URLSearchParams({
    releaseSet: meta.apiReleaseSet,
    catalogRevision: meta.apiCatalogRevision,
    knownAt: meta.catalogPublishedAt,
    cohort: meta.cohort,
    domain: meta.domain,
  })
  return {
    data: [],
    meta,
    links: { permalink: `https://source.example/places/v0.1?${params}` },
  }
}

describe('canonical Place publication discovery', () => {
  it('discovers a bounded empty ready publication without following its permalink', async () => {
    const request = vi.fn(async () => Response.json(document()))
    const publication = await discoverPlacePublication({
      baseUrl: 'https://source.example',
      apiKey: 'fixture',
      fetch: request as unknown as typeof fetch,
    })
    expect(publication).toEqual({
      pin: {
        releaseSet: 'release-a',
        catalogRevision: 'catalog-a',
        knownAt: '2026-10-18T02:10:15.383Z',
      },
      cohort: '2026-09-23.0',
      publishedAt: '2026-10-18T02:10:15.383Z',
    })
    expect(request).toHaveBeenCalledOnce()
    const [url, options] = request.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.searchParams.get('page[limit]')).toBe('1')
    expect(url.searchParams.has('releaseSet')).toBe(false)
    expect(options.redirect).toBe('error')
  })
  it.each(['releaseSet', 'catalogRevision', 'knownAt', 'cohort', 'domain'])(
    'rejects mismatched or duplicate %s selectors',
    key => {
      const d = document()
      const url = new URL(d.links.permalink)
      url.searchParams.set(key, 'other')
      d.links.permalink = url.toString()
      expect(() => parsePlacePublication(d)).toThrow('disagrees')
      const duplicate = document()
      duplicate.links.permalink += `&${key}=other`
      expect(() => parsePlacePublication(duplicate)).toThrow('disagrees')
    },
  )
  it('rejects failed discovery without yielding a checkpoint', async () => {
    await expect(
      discoverPlacePublication({
        baseUrl: 'https://source.example',
        apiKey: 'fixture',
        fetch: vi.fn(
          async () => new Response('pending', { status: 503 }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('(503)')
  })
  it.each(['region', 'resolvedApiVersion', 'catalogPublishedAt', 'cohort'])(
    'rejects incompatible %s metadata',
    key => {
      const d = document()
      Object.assign(d.meta, { [key]: 'invalid' })
      expect(() => parsePlacePublication(d)).toThrow()
    },
  )
})

describe('Place publication progression', () => {
  const accepted = parsePlacePublication(document())
  const later = {
    ...accepted,
    pin: {
      ...accepted.pin,
      catalogRevision: 'catalog-b',
      knownAt: '2026-10-19T00:00:00Z',
    },
    publishedAt: '2026-10-19T00:00:00Z',
  }
  it('distinguishes first discovery, exact replay and same-cohort curation', () => {
    expect(comparePlacePublications(null, accepted)).toBe('initial')
    expect(comparePlacePublications(accepted, structuredClone(accepted))).toBe(
      'unchanged',
    )
    expect(comparePlacePublications(accepted, later)).toBe('forward')
  })
  it('allows a newer cohort and compares numeric cohort revisions', () => {
    expect(
      comparePlacePublications(accepted, {
        ...later,
        cohort: '2026-10-01.0',
        pin: { ...later.pin, releaseSet: 'release-b' },
      }),
    ).toBe('forward')
    expect(
      comparePlacePublications(
        { ...accepted, cohort: '2026-09-23.9' },
        {
          ...later,
          cohort: '2026-09-23.10',
          pin: { ...later.pin, releaseSet: 'release-b' },
        },
      ),
    ).toBe('forward')
  })
  it('holds cohort regressions even when catalog publication time increases', () => {
    expect(
      comparePlacePublications(accepted, { ...later, cohort: '2026-08-01.0' }),
    ).toBe('review')
    expect(
      comparePlacePublications(
        { ...accepted, cohort: '2026-09-23.10' },
        {
          ...later,
          cohort: '2026-09-23.9',
        },
      ),
    ).toBe('review')
  })
  it('holds equal-time conflicts, older publications and changed same-cohort release identity', () => {
    expect(comparePlacePublications(later, accepted)).toBe('review')
    expect(
      comparePlacePublications(accepted, {
        ...later,
        publishedAt: accepted.publishedAt,
      }),
    ).toBe('review')
    expect(
      comparePlacePublications(accepted, {
        ...later,
        pin: { ...later.pin, releaseSet: 'replacement' },
      }),
    ).toBe('review')
    expect(
      comparePlacePublications(accepted, {
        ...later,
        pin: { ...later.pin, catalogRevision: accepted.pin.catalogRevision },
      }),
    ).toBe('review')
  })
})
