import { expect, it } from 'vitest'
import {
  readBrandLocationUrl,
  writeBrandLocationUrl,
} from '../lib/locations/brandLocationUrl'
it('round-trips map controls, hidden filters, neutral toggles and empty values', () => {
  const state = {
    q: '',
    category: '',
    hype: null,
    upstream: true,
    linked: false,
    filters: false,
    map: true,
  }
  const url = writeBrandLocationUrl(
    new URL(
      'https://hype.hk/admin/catalog/brand/arome?facet=locations&organisation=org',
    ),
    state,
  )
  expect(
    readBrandLocationUrl(url.searchParams, { q: 'Arome', category: 'bakery' }),
  ).toEqual(state)
  expect(url.searchParams.get('organisation')).toBe('org')
  expect(url.searchParams.get('facet')).toBe('locations')
})
it('uses safe defaults for absent or invalid controls', () => {
  expect(
    readBrandLocationUrl(new URLSearchParams('hype=invalid&view=invalid'), {
      q: 'Arome',
      category: '',
    }),
  ).toEqual({
    q: 'Arome',
    category: '',
    hype: false,
    upstream: null,
    linked: null,
    filters: true,
    map: false,
  })
})
