import { describe, expect, it } from 'vitest'
import { stationLevelOptions } from '../lib/indoor/levels'

describe('station level subtitles', () => {
  it.each([
    [
      'Concourse Level (Airport Express to or from Airport / AsiaWorld-Expo)',
      'Concourse',
      'Airport Express',
    ],
    ['Concourse Level (Tung Chung Line)', 'Concourse', 'Tung Chung Line'],
    ['Platform Level (Tung Chung Line)', 'Platform', 'Tung Chung Line'],
    ['Platform (Island Line)', 'Platform', 'Island Line'],
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
