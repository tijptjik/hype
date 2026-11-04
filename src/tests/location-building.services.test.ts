// @vitest-environment node
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import { importBuildingLocation } from '#lib/db/services/locationBuilding.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
const mocks = vi.hoisted(() => ({ names: vi.fn(), details: vi.fn() }))
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: mocks.names,
  loadBuildingDetails: mocks.details,
}))
const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.names.mockResolvedValue({
    release: 'r1',
    records: [
      {
        id: 'gers',
        name: 'Hollywood Building',
        names: { en: 'Hollywood Building' },
        divisionCodes: [],
      },
    ],
  })
  mocks.details.mockResolvedValue({
    id: 'gers',
    coordinates: [114.15, 22.3],
    addresses: [
      {
        id: 'a1',
        snapshotId: 's1',
        display: { en: '188 Hollywood Road' },
        match: 'point-in-footprint',
      },
    ],
  })
})
it('verifies exports and reuses one building identity across saves with immutable provenance', async () => {
  const store = setupLifecycleDatabase()
  stores.push(store)
  const source = { id: 'gers', release: 'r1', addressId: 'a1' }
  const identity = await importBuildingLocation(
    store.db,
    'p',
    source,
    'shared',
    'actor',
  )
  expect(
    await importBuildingLocation(
      store.db,
      'p',
      { ...source, addressId: undefined },
      'shared',
      'actor',
    ),
  ).toEqual(identity)
  expect(
    await importBuildingLocation(store.db, 'other', source, 'shared', 'other-actor'),
  ).toEqual(identity)
  expect(store.sqlite.prepare('SELECT count(*) AS n FROM location').get()?.n).toBe(1)
  const row = store.sqlite
    .prepare('SELECT rawSource, facts FROM locationRevision')
    .get()!
  expect(JSON.parse(row.rawSource as string)).toMatchObject({
    kind: 'building-export-baseline',
    buildingSource: source,
  })
  expect(readLocationFacts(row.facts as string)).toMatchObject({
    names: { en: 'Hollywood Building' },
    location: { geometry: { coordinates: [114.15, 22.3] } },
  })
  expect(mocks.details).toHaveBeenCalledExactlyOnceWith('gers', 'r1')
  expect(store.sqlite.prepare('SELECT ssId FROM location').get()?.ssId).toBeNull()
})
it('keeps exclusive buildings scoped and rejects unverified release or Address claims', async () => {
  const store = setupLifecycleDatabase()
  stores.push(store)
  await expect(
    importBuildingLocation(
      store.db,
      'p',
      { id: 'gers', release: 'stale' },
      'shared',
      'actor',
    ),
  ).rejects.toThrow('PUBLICATION_CHANGED')
  await expect(
    importBuildingLocation(
      store.db,
      'p',
      { id: 'gers', release: 'r1', addressId: 'forged' },
      'shared',
      'actor',
    ),
  ).rejects.toThrow('ADDRESS_NOT_FOUND')
  const first = await importBuildingLocation(
    store.db,
    'p',
    { id: 'gers', release: 'r1' },
    'exclusive',
    'actor',
  )
  const second = await importBuildingLocation(
    store.db,
    'other',
    { id: 'gers', release: 'r1' },
    'exclusive',
    'actor',
  )
  expect(first.locationId).not.toBe(second.locationId)
  expect(
    store.sqlite.prepare('SELECT state FROM location WHERE id=?').get(first.locationId)
      ?.state,
  ).toBe('manual')
})

it('retains reviewed name edits without replacing the original verified export evidence', async () => {
  const store = setupLifecycleDatabase()
  stores.push(store)
  const source = { id: 'gers', release: 'r1' }
  const result = await importBuildingLocation(
    store.db,
    'p',
    source,
    'shared',
    'actor',
    { en: 'Reviewed Building Name' },
  )
  const revisions = store.sqlite
    .prepare(
      'SELECT rawSource,facts FROM locationRevision WHERE locationId=? ORDER BY version',
    )
    .all(result.locationId)
  expect(revisions).toHaveLength(2)
  expect(JSON.parse(revisions[0].rawSource as string)).toMatchObject({
    buildingSource: source,
    kind: 'building-export-baseline',
  })
  expect(readLocationFacts(revisions[0].facts as string).names).toEqual({
    en: 'Hollywood Building',
  })
  expect(readLocationFacts(revisions[1].facts as string).names).toEqual({
    en: 'Reviewed Building Name',
  })
})
