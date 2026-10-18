// TESTS
import { describe, expect, test } from 'bun:test'
import { assessResponse, distanceMetres } from './benchmark.js'

const point: [number, number] = [114.1555936, 22.2826315]

describe('geocoder benchmark evidence', () => {
  test('availability failures never become poor accuracy scores', () => {
    for (const status of [401, 429, 503]) {
      const assessment = assessResponse(
        status,
        { errors: [{ status: String(status) }] },
        point,
      )
      expect(assessment.outcome).toBe('http_error')
      expect(assessment.top1Within100m).toBeNull()
    }
    expect(assessResponse(200, { data: [] }, point).outcome).toBe('no_match')
    expect(
      assessResponse(
        200,
        {
          data: [
            {
              type: 'geocoding-results',
              attributes: { status: 'incomplete' },
              relationships: {},
            },
          ],
        },
        point,
      ).outcome,
    ).toBe('incomplete')
    expect(assessResponse(200, { unexpected: true }, point).outcome).toBe(
      'invalid_response',
    )
  })

  test('candidate geometry overrides an echoed input pin and follows relationship rank', () => {
    const assessment = assessResponse(
      200,
      {
        data: [
          {
            type: 'geocoding-results',
            attributes: { status: 'ambiguous', coordinates: point },
            relationships: { address: { data: [{ type: 'addresses', id: 'far' }] } },
          },
          {
            type: 'geocoding-results',
            attributes: { status: 'ambiguous', coordinates: point },
            relationships: { address: { data: [{ type: 'addresses', id: 'near' }] } },
          },
        ],
        included: [
          {
            type: 'addresses',
            id: 'near',
            attributes: {
              geometry: { type: 'Point', coordinates: point },
              i18n: { en: { formattedAddress: '70 Queen’s Road Central' } },
            },
          },
          {
            type: 'addresses',
            id: 'far',
            attributes: {
              geometry: { type: 'Point', coordinates: [114.17, 22.28] },
              i18n: { en: { formattedAddress: 'Different street' } },
            },
          },
        ],
      },
      point,
    )
    expect(assessment.candidates[0].addresses.en).toBe('Different street')
    expect(assessment.candidates[1].distanceToGoogleMetres).toBe(0)
    expect(assessment.top1Within100m).toBe(false)
    expect(assessment.top5Within100m).toBe(true)
    expect(assessment.candidates[0].status).toBe('ambiguous')
  })

  test('distance uses WGS84 longitude/latitude and metre units', () => {
    expect(distanceMetres(point, point)).toBe(0)
    expect(distanceMetres([0, 0], [0, 1])).toBeCloseTo(111195.08, 1)
  })

  test('the fixed sample has 25 distinct Google identities across ten areas', async () => {
    const fixture = await Bun.file(
      'docs/benchmarks/geocoder-florists-2026-10-18.json',
    ).json()
    expect(fixture.places).toHaveLength(25)
    expect(
      new Set(
        fixture.places.map(
          (place: { googleFeatureId: string }) => place.googleFeatureId,
        ),
      ).size,
    ).toBe(25)
    expect(
      new Set(fixture.places.map((place: { area: string }) => place.area)).size,
    ).toBe(10)
  })
})
