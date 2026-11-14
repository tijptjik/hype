import { describe, expect, it } from 'vitest'
import {
  CatalogueArtworkSchema,
  catalogueGeneralLogo,
  resolveCatalogueMarker,
} from '../lib/locations/catalogueArtwork'
const src = '/api/identity-catalogue/logos/11111111-1111-4111-8111-111111111111'
const asset = (suffix: string, status: 'approved' | 'candidate' = 'approved') => ({
  src: src.replace(/1$/, suffix),
  status,
  background: '#ffffff',
})
describe('catalogue artwork', () => {
  it('rejects malformed and non-web provenance without throwing', () => {
    for (const sourceUrl of [
      'invalid',
      'javascript:alert(1)',
      'data:text/plain,test',
    ]) {
      expect(
        CatalogueArtworkSchema.safeParse({ logo: { ...asset('2'), sourceUrl } })
          .success,
      ).toBe(false)
    }
  })
  it('resolves theme, mode and generic marker in order', () => {
    const artwork = {
      'marker-milk': asset('2'),
      'marker-light': asset('3'),
      marker: asset('4'),
      logo: asset('5'),
    }
    expect(resolveCatalogueMarker({ artwork }, 'milk', 'light')?.slot).toBe(
      'marker-milk',
    )
    expect(resolveCatalogueMarker({ artwork }, 'other', 'light')?.slot).toBe(
      'marker-light',
    )
    expect(resolveCatalogueMarker({ artwork }, 'other', 'dark')?.slot).toBe('marker')
    expect(resolveCatalogueMarker({ artwork }, 'milk', 'light')?.whiteRing).toBe(false)
  })
  it('does not publish candidate artwork through either selector', () => {
    const owner = {
      logo: src,
      artwork: {
        'marker-milk': asset('2', 'candidate'),
        logo: asset('3', 'candidate'),
      },
    }
    expect(resolveCatalogueMarker(owner, 'milk', 'light')).toMatchObject({
      src,
      whiteRing: true,
    })
    expect(catalogueGeneralLogo(owner)).toBe(src)
    expect(catalogueGeneralLogo(owner, true)).toBe(asset('3').src)
  })
  it('rings general logos and the final generic fallback', () => {
    expect(
      resolveCatalogueMarker({ artwork: { logo: asset('2') } }, '', 'dark'),
    ).toMatchObject({ src: asset('2').src, whiteRing: true })
    expect(resolveCatalogueMarker({}, '', 'dark', '/generic.svg')).toMatchObject({
      src: '/generic.svg',
      whiteRing: true,
    })
    expect(resolveCatalogueMarker({}, '', 'dark')).toBeNull()
  })
  it('validates slot vocabulary and local asset sources', () => {
    expect(
      CatalogueArtworkSchema.safeParse({ 'marker-null-space': asset('2') }).success,
    ).toBe(true)
    expect(CatalogueArtworkSchema.safeParse({ arbitrary: asset('2') }).success).toBe(
      false,
    )
    expect(
      CatalogueArtworkSchema.safeParse({
        logo: { ...asset('2'), src: 'https://example.org/logo.png' },
      }).success,
    ).toBe(false)
  })
})
