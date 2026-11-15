// TESTS
import { describe, expect, it } from 'vitest'
// DOMAIN
import { stations } from '../lib/indoor/registry'
import { mtrLines, stationLines } from '../lib/routing/mtrLines'

describe('MTR station service lines', () => {
  it('covers every catalogue station without unknown or duplicate members', () => {
    const codes = new Set(stations.map(station => station.id))
    for (const station of stations)
      expect(stationLines(station.id).length).toBeGreaterThan(0)
    for (const line of mtrLines) {
      expect(new Set(line.stations).size).toBe(line.stations.length)
      expect(line.stations.every(code => codes.has(code))).toBe(true)
      expect(line.color).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('keeps interchange lines and branch services without merging linked stations', () => {
    const ids = (code: string) => stationLines(code).map(line => line.id)
    expect(ids('ADM')).toEqual(['TWL', 'ISL', 'SIL', 'EAL'])
    expect(ids('HOK')).toEqual(['TCL', 'AEL'])
    expect(ids('CEN')).toEqual(['TWL', 'ISL'])
    expect(ids('TST')).toEqual(['TWL'])
    expect(ids('ETS')).toEqual(['TML'])
    expect(ids('LHP')).toEqual(['TKL'])
    expect(ids('RAC')).toEqual(['EAL'])
    expect(ids('missing')).toEqual([])
  })
})
