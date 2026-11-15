import { describe, expect, it } from 'vitest'
import { exitMarkers } from '../lib/indoor/exits'
import type { Place } from '../lib/indoor/model'

function entry(id: string, levelId: string, name: string): Place {
  return {
    id,
    levelId,
    name: { en: name, 'zh-Hant': '' },
    code: '',
    category: 'entry',
    area: '',
    occupants: [],
    kind: 'facility',
    feature: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: [114.17, 22.33] },
    },
  }
}
describe('source exit markers', () => {
  it('keeps repeated exits on separate floors and distinct physical entrances', () => {
    const source = [
      entry('a', 'concourse', 'Exit H'),
      entry('b', 'platform', 'Exit H'),
      entry('c', 'platform', 'Exit H'),
    ]
    expect(exitMarkers(source, 'platform').map(m => m.place.id)).toEqual(['b', 'c'])
    expect(exitMarkers(source, 'concourse')[0].point).toEqual([114.17, 22.33])
  })
  it('preserves suffixes and descriptive names without inventing exit codes', () => {
    const source = [
      entry('a', 'g', 'Exit G1'),
      entry('b', 'g', 'Mall entrance'),
      entry('c', 'g', 'entry'),
      entry('d', 'g', 'Exit Ｅ'),
    ]
    expect(exitMarkers(source, 'g').map(m => m.label)).toEqual([
      'G1',
      'Mall entrance',
      'E',
    ])
    expect(source[0].name.en).toBe('Exit G1')
  })
  it('does not turn fare gates or invalid points into exits', () => {
    const gate = { ...entry('a', 'g', 'Exit A'), category: 'faregate' }
    const invalid = entry('b', 'g', 'Exit B')
    invalid.feature.geometry = { type: 'Point', coordinates: [NaN, 22] }
    expect(exitMarkers([gate, invalid], 'g')).toEqual([])
  })
})
