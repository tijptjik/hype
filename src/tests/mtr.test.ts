// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { describe, expect, it } from 'vitest'
// ROUTING
import {
  calculateMtrAccess,
  mtrCatalog,
  mtrFeaturePoint,
  mtrRouteDistance,
  type MtrExit,
} from '../lib/routing/mtr'

const origin = [114.17, 22.3] as const
const exits: MtrExit[] = [0.0001, 0.0002, 0.01].map((offset, i) => ({
  ...mtrCatalog.exits[0],
  id: `exit${i}`,
  station: `station${i}`,
  coordinates: [origin[0] + offset, origin[1]],
}))

describe('core MTR access', () => {
  it('chooses a farther entrance at another station when barriers lengthen the closest walk', async () => {
    const calls: string[] = []
    const result = await calculateMtrAccess(
      origin,
      async (_, exit) => {
        calls.push(exit.id)
        return exit.id === 'exit0' ? 500 : 80
      },
      'graph',
      exits,
    )
    expect(result.mtrStation).toBe('station1')
    expect(result.mtrDistance).toBe(80)
    expect(calls).toEqual(['exit0', 'exit1'])
  })
  it('keeps unreachable results empty and propagates engine failures', async () => {
    expect(
      (await calculateMtrAccess(origin, async () => null, 'graph', exits)).mtrResolution
        .status,
    ).toBe('unreachable')
    await expect(
      calculateMtrAccess(
        origin,
        async () => {
          throw new Error('engine')
        },
        'graph',
        exits,
      ),
    ).rejects.toThrow('engine')
  })
  it('accepts exactly 1 km and rejects a longer walk without losing nearer alternatives', async () => {
    const boundary = await calculateMtrAccess(
      origin,
      async () => 1000,
      'graph',
      exits.slice(0, 1),
    )
    expect(boundary.mtrDistance).toBe(1000)
    expect(boundary.mtrResolution.maxWalkingMetres).toBe(1000)
    const tooLong = await calculateMtrAccess(
      origin,
      async () => 1000.01,
      'graph',
      exits.slice(0, 1),
    )
    expect(tooLong.mtrResolution.status).toBe('unreachable')
    expect([tooLong.mtrStation, tooLong.mtrExit, tooLong.mtrDistance]).toEqual([
      null,
      null,
      null,
    ])
    const alternate = await calculateMtrAccess(
      origin,
      async (_, exit) => (exit.id === 'exit0' ? 1400 : 700),
      'graph',
      exits,
    )
    expect(alternate.mtrExit).toBe('exit1')
    expect(alternate.mtrDistance).toBe(700)
  })
  it('does not request routes for entrances beyond the 1 km lower bound', async () => {
    const remoteExit = { ...exits[0], coordinates: [114.3, 22.3] }
    const result = await calculateMtrAccess(
      origin,
      async () => {
        throw new Error('must not route')
      },
      'graph',
      [remoteExit],
    )
    expect(result.mtrResolution.status).toBe('unreachable')
    expect(result.mtrResolution.candidatesChecked).toBe(0)
  })
  it('does not invent access points for polygons or out of region points', async () => {
    expect(mtrFeaturePoint({ type: 'Polygon', coordinates: [] })).toBeNull()
    const result = await calculateMtrAccess(
      [0, 0],
      async () => {
        throw new Error('must not route')
      },
      'graph',
      exits,
    )
    expect(result.mtrResolution.status).toBe('unsupported')
  })
  it('distinguishes no path from invalid engine data and rejects ferries', () => {
    expect(mtrRouteDistance({ error_code: 442 }, origin, origin)).toBeNull()
    expect(() => mtrRouteDistance({ error_code: 499 }, origin, origin)).toThrow()
    expect(
      mtrRouteDistance(
        {
          trip: {
            status: 0,
            units: 'kilometers',
            summary: { length: 2, has_ferry: true },
            legs: [{}],
          },
        },
        origin,
        origin,
      ),
    ).toBeNull()
  })
  it('invalidates cached access and resets durable work only when geometry changes', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        "PRAGMA foreign_keys=ON; CREATE TABLE feature(id TEXT PRIMARY KEY,geometry TEXT); INSERT INTO feature VALUES ('a','old');",
      )
      db.exec(readFileSync('migrations/0096_feature_mtr_access.sql', 'utf8'))
      db.exec(
        "UPDATE feature SET mtrStation='ADM',mtrExit='exit',mtrDistance=20; DELETE FROM featureMtrJob; UPDATE feature SET geometry='old';",
      )
      expect(db.prepare('SELECT count(*) n FROM featureMtrJob').get()?.n).toBe(0)
      db.exec("UPDATE feature SET geometry='new'")
      expect(
        db.prepare('SELECT mtrStation,mtrExit,mtrDistance FROM feature').get(),
      ).toEqual({ mtrStation: null, mtrExit: null, mtrDistance: null })
      expect(db.prepare('SELECT geometry,attempts FROM featureMtrJob').get()).toEqual({
        geometry: 'new',
        attempts: 0,
      })
      db.exec("DELETE FROM feature WHERE id='a'")
      expect(db.prepare('SELECT count(*) n FROM featureMtrJob').get()?.n).toBe(0)
    } finally {
      db.close()
    }
  })
})

describe('MTR property retirement', () => {
  it('removes only legacy MTR definitions and retains the phone property', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        'CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT); CREATE TABLE propertyValue(id TEXT,propertyId TEXT); CREATE TABLE propertyValueI18n(propertyValueId TEXT);',
      )
      for (const table of [
        'featureProperty',
        'propertyI18n',
        'layerProperty',
        'projectProperty',
        'organisationProperty',
        'hubProperty',
      ])
        db.exec(`CREATE TABLE ${table}(propertyId TEXT)`)
      db.exec(
        "INSERT INTO property VALUES ('gPropMtrSt01','nearestMtrStation'),('gPropMtrEx01','mtrExit'),('gPropPhNum01','phoneNumber'),('custom','other'); INSERT INTO hubProperty VALUES ('gPropPhNum01'),('gPropMtrSt01');",
      )
      const migration = readFileSync(
        'migrations/0098_retire_mtr_properties.sql',
        'utf8',
      )
      db.exec(migration)
      db.exec(migration)
      expect(db.prepare('SELECT key FROM property ORDER BY key').all()).toEqual([
        { key: 'other' },
        { key: 'phoneNumber' },
      ])
      expect(db.prepare('SELECT propertyId FROM hubProperty').all()).toEqual([
        { propertyId: 'gPropPhNum01' },
      ])
    } finally {
      db.close()
    }
  })
})
