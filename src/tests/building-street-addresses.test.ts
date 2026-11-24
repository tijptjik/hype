// @vitest-environment node
import { assert, expect, it } from 'vitest'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  createLocalLocation,
  updateLocalLocationAddress,
} from '#lib/db/services/locationLocal.js'
import { sql } from 'drizzle-orm'
import { setupLocationServiceDatabase } from './fixtures/locationServiceDatabase'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import {
  prepareBuildingStreets,
  readBuildingStreets,
} from '#lib/db/services/buildingStreetAddresses.js'
import {
  BuildingStreetsEditSchema,
  buildingStreetLabel,
  primaryBuildingStreet,
  type BuildingStreetsEdit,
} from '#lib/locations/buildingStreetAddresses.js'

it('keeps street ranges and published links independent, switches primary and rejects a stale batch', async () => {
  const { db, sqlite } = setupLocationServiceDatabase(true)
  sqlite.exec(
    "INSERT INTO location(id,kind,class,state,ownerOrganisationId) VALUES ('corner','built','building','manual','p')",
  )
  sqlite.exec(`INSERT INTO address(id,sourceKey) VALUES('published','{"provider":"saanseoi","family":"addresses","id":"published"}');
    INSERT INTO addressRevision(id,addressId,scope,components,contentHash,sourceReferences,rawSource)
      VALUES('published:v1','published','building','{"i18n":{"en":{"formattedAddress":"22 Tak Ku Ling Road"}}}','source','[]','{}');
    INSERT INTO locationAddress(id,relationshipId,locationId,scopeOrganisationId,addressRevisionId,addressState,priority)
      VALUES('published-link','published-link','corner','p','published:v1','current',3)`)
  const save = async (edit: BuildingStreetsEdit) =>
    executeRevisionBatch(
      db,
      sql`1`,
      await prepareBuildingStreets(
        db,
        'corner',
        'p',
        BuildingStreetsEditSchema.parse(edit),
        'curator',
      ),
    )
  const read = () => readBuildingStreets(db, 'corner', 'p')
  const rows: BuildingStreetsEdit['rows'] = [
    { head: null, number: '20–24', names: { en: 'Tak Ku Ling Road' }, priority: 0 },
    {
      head: null,
      number: '32–38',
      names: { en: 'Nga Tsin Wai Road', 'zh-hant': '衙前圍道' },
      priority: null,
    },
  ]
  expect(await save({ expectedHeads: [], rows })).toBeTruthy()
  const before = await read()
  expect(before).toHaveLength(2)
  const primary = primaryBuildingStreet(before)
  assert(primary)
  expect(buildingStreetLabel(primary, 'en')).toBe('20-24 Tak Ku Ling Road')
  const expectedHeads = before.map(row => row.head)
  const updated = before.map(row => ({
    ...row,
    priority: row.names.en === 'Nga Tsin Wai Road' ? 0 : null,
  }))
  expect(await save({ expectedHeads, rows: updated })).toBeTruthy()
  const after = await read()
  const newPrimary = primaryBuildingStreet(after)
  assert(newPrimary)
  expect(buildingStreetLabel(newPrimary, 'zh-hant')).toBe('衙前圍道32-38號')
  expect(await readBuildingStreets(db, 'corner', 'other')).toEqual([])
  expect(await save({ expectedHeads: [], rows })).toBeNull()
  expect(await read()).toEqual(after)
  expect(
    await save({
      expectedHeads: after.map(row => row.head),
      rows: [{ ...after[0], number: '32–36B', priority: null }],
    }),
  ).toBeTruthy()
  const remaining = await read()
  expect(remaining).toHaveLength(1)
  expect(remaining[0].number).toBe('32-36B')
  expect(primaryBuildingStreet(remaining)).toBeUndefined()
  expect(
    sqlite
      .prepare("SELECT COUNT(*) n FROM addressRevision WHERE addressId != 'published'")
      .get()?.n,
  ).toBe(3)
  expect(
    sqlite
      .prepare(
        "SELECT id,priority FROM locationAddressHead WHERE relationshipId='published-link'",
      )
      .get(),
  ).toEqual({ id: 'published-link', priority: 3 })
})

it('commits a private Profile save atomically with its authored street and rolls back a conflicting edit', async () => {
  const { db, sqlite } = setupLocationServiceDatabase(true)
  const location = localIdentityFromAddress(
    'building',
    { en: 'Corner Building' },
    { ...emptyFeatureAddress(), coordinates: [114.19, 22.32] },
    'exclusive',
  )
  const { locationId, revisionId } = await createLocalLocation(
    db,
    'p',
    location,
    'curator',
  )
  const input = {
    locationId,
    organisationId: 'p',
    actorId: 'curator',
    expectedRevisionId: revisionId,
    expectedOrganisationRevision: null,
    expectedKind: 'building' as const,
  }
  const buildingStreets: BuildingStreetsEdit = {
    expectedHeads: [],
    rows: [
      { head: null, number: '32–38', names: { en: 'Nga Tsin Wai Road' }, priority: 0 },
    ],
  }
  const result = await updateLocalLocationAddress(db, {
    ...input,
    names: { en: 'Reviewed building' },
    buildingStreets,
  })
  assert(result?.organisationRevision)
  const before = await readBuildingStreets(db, locationId, 'p')
  const primary = primaryBuildingStreet(before)
  assert(primary)
  expect(buildingStreetLabel(primary, 'en')).toBe('32-38 Nga Tsin Wai Road')
  await expect(
    updateLocalLocationAddress(db, {
      ...input,
      expectedOrganisationRevision: result.organisationRevision,
      names: { en: 'Stale name' },
      buildingStreets,
    }),
  ).rejects.toThrow()
  expect(await readBuildingStreets(db, locationId, 'p')).toEqual(before)
  expect(
    sqlite
      .prepare('SELECT revision FROM organisationLocationHead WHERE locationId=?')
      .get(locationId)?.revision,
  ).toBe(result.organisationRevision)
})

it('retains a shared designation when an organisation changes its local street name', async () => {
  const { db, sqlite } = setupLocationServiceDatabase(true)
  sqlite.exec(
    "INSERT INTO location(id,kind,class,state,ownerOrganisationId) VALUES ('shared-corner','built','building','unresolved','p')",
  )
  const save = async (scope: string | null, edit: BuildingStreetsEdit) =>
    executeRevisionBatch(
      db,
      sql`1`,
      await prepareBuildingStreets(db, 'shared-corner', scope, edit, 'curator'),
    )
  await save(null, {
    expectedHeads: [],
    rows: [
      { head: null, number: '20-24', names: { en: 'Tak Ku Ling Road' }, priority: 0 },
    ],
  })
  const shared = await readBuildingStreets(db, 'shared-corner', null)
  await save('p', {
    expectedHeads: [shared[0].head],
    rows: [{ ...shared[0], names: { en: 'Other Street' } }],
  })
  expect(await readBuildingStreets(db, 'shared-corner', null)).toEqual(shared)
  expect(await readBuildingStreets(db, 'shared-corner', 'other')).toEqual(shared)
  expect((await readBuildingStreets(db, 'shared-corner', 'p'))[0].names.en).toBe(
    'Other Street',
  )
  expect(
    sqlite.prepare('SELECT COUNT(DISTINCT addressId) n FROM addressRevision').get()?.n,
  ).toBe(2)
})
