// @vitest-environment node
import { expect, it } from 'vitest'
import { addressBlocks, positionAddress } from '#lib/addresses/blocks.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { locationMoveDistance } from '#lib/locations/reviewPresentation.js'

it('separates unit, building, premises and street while preserving explicit clears', () => {
  const address = emptyFeatureAddress()
  address.source.authored = {
    scope: 'unit',
    i18n: {
      en: {
        formattedAddress: '',
        buildingName: 'East Wing',
        blockExpression: 'Block A',
        phaseExpression: 'Phase 1',
        premisesName: 'Example Court',
        buildingNumberExpression: '18',
        streetName: 'Sample Street',
      },
    },
    unit: {
      unitRef: '12',
      unitType: 'S',
      floorRef: '1',
      floorType: 'F',
      unitPortion: null,
    },
    unitI18n: {},
  }
  const rows = addressBlocks(address, 'en')
  expect(rows.unit).toContain('12')
  expect(rows.unit).toContain('1')
  address.unitDetails = { unitRef: '9', unitType: 'S', floorRef: '3', floorType: 'F' }
  expect(addressBlocks(address, 'en').unit).toContain('9')
  expect(addressBlocks(address, 'en').unit).not.toContain('12')
  expect(rows.building).toBe('East Wing')
  expect(rows.premises).toBe('Block A, Phase 1, Example Court')
  expect(rows.street).toBe('18 Sample Street')
  address.overrides.en = { buildingName: null }
  expect(addressBlocks(address, 'en').building).toBe('')
})

it('keeps all geographic groups distinct and omits city concepts', () => {
  const row = (id: string, category: string, level: number) => ({
    id,
    class: id,
    category,
    level,
    names: { en: { name: id } },
  })
  const blocks = addressBlocks(emptyFeatureAddress(), 'en', [
    row('district', 'administrative', 5),
    row('neighbourhood', 'locality', 6),
    row('major_island', 'landform', 1),
  ])
  expect(blocks.administrative).toContain('district')
  expect(blocks.locality).toContain('neighbourhood')
  expect(blocks.landform).toContain('major_island')
})

it('measures longitude/latitude in metres with zero displacement and dateline support', () => {
  expect(locationMoveDistance([114.16, 22.3], [114.16, 22.3])).toBe(0)
  expect(locationMoveDistance([114.16, 22.3], [114.17, 22.31])).toBeGreaterThan(1500)
  expect(locationMoveDistance([114.16, 22.3], [114.17, 22.31])).toBeLessThan(1600)
  expect(locationMoveDistance([179.999, 0], [-179.999, 0])).toBeCloseTo(222.39, 0)
  expect(positionAddress(null).coordinates).toBeNull()
})
