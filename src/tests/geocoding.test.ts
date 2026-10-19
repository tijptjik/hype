// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// API
import { geocodeAddress, parseGeocodeResult } from '#lib/api/external/geocoding.js'

const pin = { lng: 114.1588, lat: 22.2788 }
const response = (
  formattedAddress = 'MAIN WING, JUSTICE PLACE, 18 LOWER ALBERT ROAD, CENTRAL & WESTERN DISTRICT, HK',
) => ({
  data: [
    {
      type: 'geocoding-results',
      attributes: {
        status: 'resolved',
        coordinates: [0, 0],
        match: { distanceMetres: 20 },
      },
      relationships: { address: { data: [{ type: 'addresses', id: 'correct' }] } },
    },
  ],
  included: [
    { type: 'addresses', id: 'unrelated', attributes: {} },
    {
      type: 'addresses',
      id: 'correct',
      attributes: {
        geometry: { type: 'Point', coordinates: [114.15862, 22.27886] },
        i18n: {
          en: {
            formattedAddress,
            buildingName: 'MAIN WING',
            estateName: 'JUSTICE PLACE',
            buildingNumberFrom: '18',
            buildingNumberExpression: '18',
            streetName: 'LOWER ALBERT ROAD',
          },
          'zh-hant': {
            formattedAddress: '中座律政中心18下亞厘畢道中西區香港',
            buildingName: '中座',
            estateName: '律政中心',
            buildingNumberExpression: '18',
            streetName: '下亞厘畢道',
          },
        },
      },
    },
  ],
})

describe('SaanSeoi geocoding', () => {
  it('follows the address relationship, trims urban divisions, and preserves the selected pin', () => {
    const result = parseGeocodeResult(response(), pin)!
    expect(result.i18n.en.displayAddress).toBe(
      'Main Wing, Justice Place, 18 Lower Albert Rd',
    )
    expect(result.i18n.zhHant.displayAddress).toBe('下亞厘畢道18號律政中心中座')
    expect(result.i18n.zhHans.displayAddress).toBe(result.i18n.zhHant.displayAddress)
    expect(result.addressMeta).toMatchObject({
      longitude: pin.lng,
      latitude: pin.lat,
      saanseoiAddressId: 'correct',
      addressReverseGeocoder: 'saanseoi',
      distanceFromPoint: 20,
    })
    expect(result.i18n.en.addressProperties.district).toBeUndefined()
  })

  it('trims Kowloon labels and retains New Territories locality context', () => {
    expect(
      parseGeocodeResult(
        response('18 LOWER ALBERT ROAD, YAU TSIM MONG DISTRICT, KLN'),
        pin,
      )!.i18n.en.displayAddress,
    ).not.toContain('District')
    expect(
      parseGeocodeResult(response('18 LOWER ALBERT ROAD, SHA TIN DISTRICT, NT'), pin)!
        .i18n.en.displayAddress,
    ).toContain('Sha Tin District')
  })

  it('preserves number suffixes/ranges and prefers native Simplified Chinese when supplied', () => {
    const body = response()
    const values = body.included[1].attributes.i18n!
    values.en.buildingNumberExpression = '18A-20B'
    Object.assign(values, {
      'zh-hans': {
        formattedAddress: '简体地址',
        streetName: '下亚厘毕道',
        buildingNumberExpression: '18A-20B',
      },
    })
    const result = parseGeocodeResult(body, pin)!
    expect(result.i18n.en.displayAddress).toContain('18A-20B')
    expect(result.i18n.zhHans.displayAddress).toBe('下亚厘毕道18A-20B号')
  })

  it('uses actual candidate geometry for forward geocoding, never echoed result coordinates', () => {
    const result = parseGeocodeResult(response(), { address: '18 Lower Albert Road' })!
    expect(result.addressMeta).toMatchObject({
      longitude: 114.15862,
      latitude: 22.27886,
      addressForwardGeocoder: 'saanseoi',
    })
    expect(result.i18n.en.addressProperties.rawAddress).toBe('18 Lower Albert Road')
  })

  it('distinguishes no match from malformed or failed responses', async () => {
    expect(parseGeocodeResult({ data: [] }, pin)).toBeNull()
    const incomplete = response()
    incomplete.data[0].attributes.status = 'incomplete'
    expect(parseGeocodeResult(incomplete, pin)).toBeNull()
    expect(() => parseGeocodeResult({ unrelated: true }, pin)).toThrow()
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      geocodeAddress(pin, { baseUrl: 'https://api.saanseoi.hk', fetcher }),
    ).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('calls SaanSeoi directly without keys, cookies or a manually supplied Origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response()))
    await geocodeAddress(pin, {
      baseUrl: 'https://api.saanseoi.hk',
      fetcher,
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url.origin + url.pathname).toBe(
      'https://api.saanseoi.hk/addresses/v1/geocode',
    )
    expect(url.searchParams.get('lng')).toBe(String(pin.lng))
    expect(url.searchParams.get('profile')).toBe('map')
    expect(url.toString()).not.toContain('test-key')
    expect(init.headers['x-api-key']).toBeUndefined()
    expect(init.headers.Origin).toBeUndefined()
    expect(init.credentials).toBe('omit')
  })
})
