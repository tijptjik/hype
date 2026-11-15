import { describe, expect, it } from 'vitest'
import { stationLevelOptions, stationFloorCallout } from '../lib/indoor/levels'

describe('station level subtitles', () => {
  it.each([
    [
      'Concourse Level (Airport Express to or from Airport / AsiaWorld-Expo)',
      'Concourse',
      'Airport Express',
    ],
    ['Concourse Level (Tung Chung Line)', 'Concourse', 'Tung Chung Line'],
    ['Platform Level (Tung Chung Line)', 'Platform', 'Tung Chung Line'],
    ['Platform Level (Tung Chung Line) ', 'Platform', 'Tung Chung Line'],
    ['Plant Room Level (Near Exit A)', 'Plant Room', 'Near Exit A'],
    ['Plant Room Level (Near Exit B)', 'Plant Room', 'Near Exit B'],
    ['Platform Level 1 (Airport Express)', 'Platform 1', 'Airport Express'],
    ['Landing Level (East)', 'Landing', 'East'],
    ['Ground Level (Waterloo Road)', 'Ground', 'Waterloo Road'],
    ['Platform (Island Line)', 'Platform', 'Island Line'],
    ['Platform 2 - to AsiaWorld-Expo', 'Platform 2', 'To AsiaWorld-Expo'],
    ['Platform 1 - to City', 'Platform 1', 'To City'],
    ['Concourse Level (Tsuen Wan Line)', 'Concourse', 'Tsuen Wan Line'],
  ])('formats %s without changing source evidence', (name, floor, line) => {
    const properties = { level_id: 'floor', level_name_en: name, level_ordinal: 0 }
    const option = stationLevelOptions([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [114, 22] },
        properties,
      },
    ])[1]
    expect(option).toMatchObject({ floor, line, label: `${floor} · ${line}` })
    expect(properties.level_name_en).toBe(name)
  })
})

describe('multi-exit floor names', () => {
  it.each([
    ['Exit E1 & E2 Ground Level', 'Ground', 'E1 & E2'],
    ['Exit D3 & D4 Basement Level 1', 'Basement Level 1', 'D3 & D4'],
    ['Exit C1 Ground Level', 'Ground', 'C1'],
  ])('separates %s', (name, floor, exit) => {
    const option = stationLevelOptions([
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [114, 22] },
        properties: { level_id: 'floor', level_name_en: name, level_ordinal: 0 },
      },
    ])[1]
    expect(option).toMatchObject({
      floor,
      exit,
      kind: 'exit',
      label: `${floor} · Exit ${exit}`,
    })
  })
})

describe('exploded floor callouts', () => {
  it.each([
    ['Platform Level (Kwun Tong Line)', 'Platform · Kwun Tong Line'],
    ['Platform level (Tseung Kwan O Line)', 'Platform · Tseung Kwan O Line'],
    ['Platform Level 2 (Airport Express)', 'Platform 2 · Airport Express'],
    ['Plant Room Level (Near Exit A)', 'Plant Room · Near Exit A'],
    [
      'Exit C2 Ground Level (To Light Rail Platform 3)',
      'Exit C2 · G/F · To Light Rail Platform 3',
    ],
    ['Basement Level (East)', 'B/F · East'],
    ['Platform 1 - to City', 'Platform 1 · To City'],
    ['Exit C Concourse Level', 'Exit C · Concourse'],
    ['Exit A Podium Level', 'Exit A · Podium'],
    ['Exit B2 Elevator Ground Level', 'Exit B2 · Elevator · G/F'],
    ['Exit D3 & D4 Concourse Level', 'Exit D3 & D4 · Concourse'],
    ['Exit A1 · G/F', 'Exit A1 · G/F'],
    ['Exit A1', 'Exit A1'],
    ['Exit A1 Level 2', 'Exit A1 · 2/F'],
    ['Exit A1 Level 1', 'Exit A1 · 1/F'],
    ['Exit A2 Level 8', 'Exit A2 · 8/F'],
    ['Exit E Upper Level 1', 'Exit E · U1/F'],
    ['Exit A1 Ground Level', 'Exit A1 · G/F'],
    ['Exit F2 Basement', 'Exit F2 · B/F'],
    ['Exit F2 Basement Level', 'Exit F2 · B/F'],
    ['Exit F2 Basement 1', 'Exit F2 · B1/F'],
    ['Exit D3 & D4 Basement Level 1', 'Exit D3 & D4 · B1/F'],
    ['Basement', 'B/F'],
    ['Basement Level 2', 'B2/F'],
    ['Exit A1 Basement Level 1', 'Exit A1 · B1/F'],
    ['Exit A1 Basement Level 2', 'Exit A1 · B2/F'],
  ])('formats %s', (source, expected) => {
    expect(stationFloorCallout(source)).toBe(expected)
  })
})
