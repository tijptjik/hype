import { expect, it } from 'vitest'
import {
  groupResearchLocations,
  researchStreetAddresses,
} from '#lib/fieldResearch/locationStreets.js'

it('places each building once per street at its lowest number on that street', () => {
  const corner = {
    id: 'a',
    name: 'Corner building',
    streetAddresses: [
      ...researchStreetAddresses('Corner building, 34A TAK KU LING ROAD, KLN'),
      ...researchStreetAddresses('South entrance', 'Kai Tak Road', '12'),
      ...researchStreetAddresses('32 Tak Ku Ling Road'),
      ...researchStreetAddresses('32 Tak Ku Ling Road'),
    ],
  }
  const locations = [
    corner,
    ...[
      '17 Kai Tak Road',
      '8 TAK KU LING ROAD',
      '20–24 Tak Ku Ling Road',
      'Wing Shing House',
    ].map(label => ({
      id: label,
      name: label,
      streetAddresses: researchStreetAddresses(label),
    })),
  ]
  const groups = groupResearchLocations(locations)
  expect(groups.map(group => group.key)).toEqual([
    'Kai Tak Road',
    'Tak Ku Ling Road',
    '',
  ])
  expect(groups[0].rows.map(row => row.item.name)).toEqual([
    'Corner building',
    '17 Kai Tak Road',
  ])
  expect(groups[1].rows.map(row => row.item.name)).toEqual([
    '8 TAK KU LING ROAD',
    '20–24 Tak Ku Ling Road',
    'Corner building',
  ])
  expect(groups[1].rows[2].addresses.map(address => address.number)).toEqual([
    '32',
    '34A',
  ])
  expect(groups[2].rows[0].addresses[0].label).toBe('Wing Shing House')
  expect(corner.streetAddresses).toHaveLength(4)
})

it('keeps street-only addresses after numbered addresses and reads a composite display', () => {
  const groups = groupResearchLocations([
    {
      id: 'corner',
      name: 'Corner',
      streetAddresses: researchStreetAddresses(
        '12 Kai Tak Road · 2 Lung Kong Road',
        'Kai Tak Road',
        '12',
      ),
    },
    {
      id: 'street',
      name: 'A',
      streetAddresses: researchStreetAddresses('KAI TAK ROAD'),
    },
  ])
  expect(groups[0].rows.map(row => row.item.id)).toEqual(['corner', 'street'])
  expect(groups[1].rows[0].addresses[0].number).toBe('2')
})

it('collapses frontages outside street mode, keeping equal numbers on different streets', () => {
  const corner = {
    id: 'c',
    name: 'Alpha',
    districts: ['Kowloon City District'],
    streetAddresses: researchStreetAddresses('2 Kai Tak Road · 2 Lung Kong Road'),
  }
  const higher = {
    id: 'b',
    name: 'Zulu',
    districts: ['Kowloon City District'],
    streetAddresses: researchStreetAddresses('12 Kai Tak Road'),
  }
  const unknown = { id: 'u', name: 'Market', districts: [], streetAddresses: [] }
  const locations = [unknown, corner, higher]
  const groups = groupResearchLocations(locations, 'district', 'number-desc')
  expect(groups.map(group => group.key)).toEqual(['Kowloon City District', ''])
  expect(groups[0].rows.map(row => row.item.id)).toEqual(['b', 'c'])
  expect(groups[0].rows[1].addresses).toHaveLength(2)
  for (const [sort, order] of [
    ['number-asc', ['c', 'b', 'u']],
    ['number-desc', ['b', 'c', 'u']],
    ['name-asc', ['c', 'u', 'b']],
    ['name-desc', ['b', 'u', 'c']],
  ] as const) {
    const flat = groupResearchLocations(locations, 'none', sort)
    expect(flat).toHaveLength(1)
    expect(flat[0].rows.map(row => row.item.id)).toEqual(order)
  }
})
