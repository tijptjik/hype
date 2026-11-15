import { describe, expect, it } from 'vitest'
import {
  CatalogueArtworkSchema,
  resolveCatalogueFormatArtwork,
  resolveCatalogueDisplayLogo,
  catalogueArtworkMeetsMinimum,
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
  it('makes new artwork active without a separate review step', () => {
    const artwork = CatalogueArtworkSchema.parse({ logo: { src, format: 'svg' } })
    expect(artwork.logo.status).toBe('approved')
    expect(resolveCatalogueDisplayLogo({ artwork }, 'null-space', 'dark')).toBe(src)
  })
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

describe('catalogue display quality', () => {
  it('uses approved theme then mode then generic artwork, excluding candidates', () => {
    const owner = {
      logo: src,
      artwork: {
        'logo-breadline-light': asset('2'),
        'marker-dark': asset('3'),
        marker: asset('4'),
        logo: asset('5', 'candidate'),
      },
    }
    expect(resolveCatalogueDisplayLogo(owner, 'breadline-light', 'light')).toBe(
      asset('2').src,
    )
    expect(resolveCatalogueDisplayLogo(owner, 'hype-black', 'dark')).toBe(
      asset('3').src,
    )
    expect(resolveCatalogueDisplayLogo(owner, 'hype-light', 'light')).toBe(
      asset('4').src,
    )
    expect(
      resolveCatalogueDisplayLogo(
        { logo: src, artwork: { logo: asset('5', 'candidate') } },
        'hype-light',
        'light',
      ),
    ).toBe(src)
    expect(
      resolveCatalogueDisplayLogo(owner, 'breadline-dark', 'dark', '/curated.svg'),
    ).toBe('/curated.svg')
  })
  it('requires source detail instead of preview canvas dimensions', () => {
    expect(
      catalogueArtworkMeetsMinimum({
        ...asset('2'),
        sourceWidth: 32,
        sourceHeight: 32,
      }),
    ).toBe(false)
    expect(catalogueArtworkMeetsMinimum(asset('2'))).toBe(false)
    expect(
      catalogueArtworkMeetsMinimum({
        ...asset('2'),
        sourceWidth: 512,
        sourceHeight: 512,
      }),
    ).toBe(true)
    expect(catalogueArtworkMeetsMinimum({ ...asset('2'), format: 'svg' })).toBe(true)
  })
})

describe('establishment format artwork', () => {
  const owner = {
    code: 'eslite',
    artwork: {
      logo: asset('2'),
      'marker-dark': asset('3'),
      'logo-format-flavor': asset('4'),
      'logo-format-flavor-dark': asset('5'),
      'logo-format-flavor-null-space': asset('6'),
    },
  }
  it('selects a format before brand artwork and supports localized or brand-prefixed labels', () => {
    expect(
      resolveCatalogueMarker(owner, 'milk', 'light', undefined, {
        en: 'eslite flavor',
        'zh-Hant': '知味',
      })?.src,
    ).toBe(asset('4').src)
    expect(
      resolveCatalogueMarker(owner, 'other', 'dark', undefined, 'flavor')?.src,
    ).toBe(asset('5').src)
    expect(
      resolveCatalogueMarker(owner, 'null-space', 'dark', undefined, 'flavor')?.src,
    ).toBe(asset('6').src)
  })
  it('uses the general format for unthemed station surfaces and falls back for missing formats', () => {
    expect(resolveCatalogueFormatArtwork(owner, 'flavor')?.src).toBe(asset('4').src)
    expect(
      resolveCatalogueMarker(owner, 'other', 'dark', undefined, 'unknown')?.src,
    ).toBe(asset('3').src)
    expect(resolveCatalogueFormatArtwork(owner, undefined)).toBeNull()
  })
  it('does not select unapproved format assets', () => {
    const candidate = {
      artwork: { logo: asset('2'), 'logo-format-flavor': asset('4', 'candidate') },
    }
    expect(
      resolveCatalogueMarker(candidate, 'milk', 'light', undefined, 'flavor')?.src,
    ).toBe(asset('2').src)
  })
})
