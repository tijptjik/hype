import { describe, expect, it } from 'vitest'
import { parseCoordinateInput } from '#lib/addresses/coordinateInput.js'

describe('coordinate paste', () => {
  it.each([
    '114.15221, 22.28334',
    '22.28334,114.15221',
    '[114.15221,22.28334]',
    '[22.28334,114.15221]',
    '(22.28334, 114.15221)',
    '22.28334 114.15221',
    '{"lat":22.28334,"lng":114.15221}',
    '{lng:114.15221, lat:22.28334}',
    '{"latitude":"22.28334","longitude":"114.15221"}',
    '{"LAT":22.28334,"LON":114.15221}',
    '{"coordinates":[22.28334,114.15221]}',
    '{"type":"Point","coordinates":[114.15221,22.28334]}',
  ])('normalizes %s to longitude/latitude', input => {
    expect(parseCoordinateInput(input)).toEqual([114.15221, 22.28334])
  })
  it('preserves full precision and signed values outside Hong Kong', () => {
    expect(parseCoordinateInput('[-73.985123456789,40.748123456789]')).toEqual([
      -73.985123456789, 40.748123456789,
    ])
    expect(parseCoordinateInput('[-33.86,151.21]')).toEqual([151.21, -33.86])
    expect(parseCoordinateInput('[2.35,48.85]')).toEqual([2.35, 48.85])
  })
  it.each([
    '',
    '114.15',
    '[114.15]',
    '[114,22,10]',
    '114,22,',
    '[true,22]',
    '[null,22]',
    '["",22]',
    'Infinity,22',
    '999,222',
    '{"lat":114,"lng":22}',
    '{"lat":22}',
    '{"type":"Point","coordinates":[22,114]}',
    '{"type":"LineString","coordinates":[114,22]}',
    '{lat:22,lng:alert(1)}',
  ])('rejects incomplete, malformed or explicitly invalid coordinates: %s', input => {
    expect(parseCoordinateInput(input)).toBeNull()
  })
})
