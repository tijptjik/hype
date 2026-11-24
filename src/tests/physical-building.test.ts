// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
vi.mock('#lib/sources/saanseoi.js', async original => ({
  ...(await original<typeof import('#lib/sources/saanseoi.js')>()),
  loadBuildingNames: async () => ({
    release: 'publication',
    // The second verified footprint is absent from the published names index.
    records: [{ id: 'first', names: { en: 'First building' } }],
  }),
  loadBuildingDetails: async (id: string) => ({
    id,
    coordinates: [114.19, 22.32],
    addresses: [],
  }),
}))
import { sql } from 'drizzle-orm'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import { archiveLocalLocation } from '#lib/db/services/locationDeletion.js'
import { probeLocationIdentityScope } from '#lib/db/services/locationIdentityReview.js'
import { importBuildingLocation } from '#lib/db/services/locationBuilding.js'
import { localIdentityFromAddress } from '#lib/locations/addressIdentity.js'
import {
  createLocalLocation,
  updateLocalLocationAddress,
} from '#lib/db/services/locationLocal.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import {
  designatePhysicalBuilding,
  readBuildingProfileRoles,
  physicalBuildingMembers,
  savePhysicalBuildingMember,
} from '#lib/db/services/physicalBuilding.js'
import {
  physicalBuildingAddresses,
  physicalBuildingProfile,
  type PhysicalBuildingMember,
} from '#lib/locations/physicalBuilding.js'
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '#lib/addresses/featureAddress.js'
import { setupLocationServiceDatabase } from './fixtures/locationServiceDatabase'

function member(
  id: string,
  number: string,
  street = 'Tak Ku Ling Road',
): PhysicalBuildingMember {
  return {
    source: { id, release: 'publication' },
    coordinates: [114.19, 22.32],
    addresses: [
      {
        id: 'address-' + id,
        snapshotId: 'snapshot',
        match: 'point-in-footprint',
        display: { en: number + ' ' + street },
        streets: { en: { name: street, number } },
      },
    ],
  }
}

describe('physical building source membership', () => {
  it('reports the missing membership migration before importing or creating a building', async () => {
    const { db, sqlite } = setupLocationServiceDatabase(true)
    sqlite.exec('DROP TRIGGER location_composition_member')
    const count = () => sqlite.prepare('SELECT count(*) AS total FROM location').get()
    const before = count()
    await expect(
      savePhysicalBuildingMember(
        db,
        'p',
        'user',
        { requestId: 'unmigrated' },
        member('first', '25', 'Kai Tak Road'),
      ),
    ).rejects.toMatchObject({
      status: 503,
      body: { message: expect.stringContaining('migration 0271') },
    })
    expect(count()).toEqual(before)
  })
  it('prepares the deletion blocker under D1’s five-term compound SELECT limit', () => {
    const { sqlite } = setupLocationServiceDatabase(true)
    const definitions = sqlite
      .prepare(`
      SELECT sql FROM sqlite_master
      WHERE (type='table' AND name NOT LIKE 'sqlite_%') OR name='locationDeletionBlocker'
      ORDER BY type
    `)
      .all() as { sql: string }[]
    // Node's SQLite accepts longer UNION chains. Compile the actual migrated view with D1's limit.
    const result = spawnSync(
      'python3',
      [
        '-c',
        `
import sqlite3, sys
db = sqlite3.connect(':memory:')
db.setlimit(sqlite3.SQLITE_LIMIT_COMPOUND_SELECT, 5)
db.executescript(sys.stdin.read())
db.execute('SELECT 1 FROM locationDeletionBlocker WHERE locationId=?', ('test',)).fetchall()
`,
      ],
      { input: definitions.map(row => row.sql + ';').join('\n'), encoding: 'utf8' },
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
  })
  it('deletes only the unused parent and retains constituent identities and evidence', async () => {
    const { db, sqlite } = setupLocationServiceDatabase(true)
    const locationId = await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { requestId: 'delete-parent' },
      member('first', '25'),
    )
    const edge = sqlite
      .prepare(
        'SELECT childLocationId FROM locationMembershipHead WHERE parentLocationId=?',
      )
      .get(locationId) as { childLocationId: string }
    const { id: revisionId } = sqlite
      .prepare('SELECT id FROM locationRevision WHERE locationId=?')
      .get(locationId) as { id: string }
    const input = {
      locationId,
      revisionId,
      actorId: 'curator',
      state: 'unresolved' as const,
      ownerOrganisationId: 'p',
    }
    expect(await archiveLocalLocation(db, { ...input, revisionId: 'stale' })).toBe(
      'changed',
    )
    expect(
      await archiveLocalLocation(db, { ...input, ownerOrganisationId: 'other' }),
    ).toBe('changed')
    const link = sqlite.prepare(
      "INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId) VALUES('f',?,?,?)",
    )
    link.run(locationId, revisionId, revisionId)
    expect(await archiveLocalLocation(db, input)).toBe('in-use')
    sqlite.exec("DELETE FROM featureLocation WHERE featureId='f'")
    sqlite
      .prepare("INSERT INTO fieldResearchRecord(id,locationId) VALUES('capture',?)")
      .run(locationId)
    expect(await archiveLocalLocation(db, input)).toBe('in-use')
    sqlite.exec("UPDATE fieldResearchRecord SET locationId=NULL WHERE id='capture'")
    expect(await archiveLocalLocation(db, input)).toBe('deleted')
    expect(() =>
      sqlite
        .prepare("UPDATE fieldResearchRecord SET locationId=? WHERE id='capture'")
        .run(locationId),
    ).toThrow('Location was deleted')
    expect(await probeLocationIdentityScope(db, locationId)).toBeNull()
    expect(await probeLocationIdentityScope(db, edge.childLocationId)).toMatchObject({
      state: 'unresolved',
    })
    expect(
      sqlite
        .prepare('SELECT actorId FROM locationDeletion WHERE locationId=?')
        .get(locationId),
    ).toEqual({ actorId: 'curator' })
    expect(
      sqlite
        .prepare('SELECT id FROM locationMembershipHead WHERE parentLocationId=?')
        .get(locationId),
    ).toBeUndefined()
    expect(
      sqlite
        .prepare('SELECT id FROM locationMembership WHERE parentLocationId=?')
        .get(locationId),
    ).toBeTruthy()
    expect(
      sqlite.prepare('SELECT id FROM locationRevision WHERE id=?').get(revisionId),
    ).toBeTruthy()
    expect(() => link.run(locationId, revisionId, revisionId)).toThrow()
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('groups distinct frontages, ranges and suffixes numerically, retaining unparsed addresses', () => {
    const unknown = member('unknown', '')
    unknown.addresses[0].streets = {}
    unknown.addresses[0].display.en = 'Market Annex'
    const members = [
      member('a', '10B'),
      member('b', '8–2'),
      member('c', '36', 'Second Street'),
      unknown,
    ]
    expect(physicalBuildingAddresses(members).en.split(' · ').sort()).toEqual([
      '2–10B Tak Ku Ling Road',
      '36 Second Street',
      'Market Annex',
    ])
    expect(physicalBuildingAddresses([{ ...unknown, addresses: [] }])).toEqual({})
  })
  it('keeps distinct streets in the display and only promotes agreeing translations', () => {
    const members: PhysicalBuildingMember[] = [
      { ...member('a', '31A'), names: { en: 'Tower A', 'zh-hant': '佳景樓' } },
      { ...member('b', '9'), names: { en: 'Tower B' } },
      member('c', '1', 'Second Street'),
    ]
    const profile = physicalBuildingProfile(members)
    expect(profile.names).toEqual({ 'zh-hant': '佳景樓' })
    expect(profile.content.i18n.en).toEqual({
      formattedAddress: '9–31A Tak Ku Ling Road · 1 Second Street',
    })
  })
  it('creates once, appends distinct source IDs, reloads the range and limits writes to the owner', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const a = member('first', '36'),
      b = member('second', '38')
    const create = { requestId: 'retry-token' }
    const parentId = await savePhysicalBuildingMember(db, 'p', 'user', create, a)
    expect(await savePhysicalBuildingMember(db, 'p', 'user', create, a)).toBe(parentId)
    await expect(
      savePhysicalBuildingMember(db, 'other', 'user', { parentId }, b),
    ).rejects.toThrow('unavailable')
    await expect(
      savePhysicalBuildingMember(db, 'p', 'user', create, b),
    ).rejects.toThrow('another building')
    await savePhysicalBuildingMember(db, 'p', 'user', { parentId }, b)
    await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { parentId },
      { ...b, source: { ...b.source, addressId: 'alternative' } },
    )
    const row = await db.get<{ members: string; facts: string; version: number }>(
      sql`SELECT ${physicalBuildingMembers(sql`r.locationId`)} members,r.facts,r.version FROM locationRevisionContent r WHERE r.locationId=${parentId} ORDER BY version DESC LIMIT 1`,
    )
    expect(row.version).toBe(2)
    expect(JSON.parse(row.members)).toMatchObject([a, b])
    const joins = await db.all<{
      child: string
      pinned: string
      parent: string
    }>(sql`SELECT m.childLocationId child,c.locationId pinned,m.parentLocationId parent
      FROM locationMembershipHead m JOIN locationRevision c ON c.id=json_extract(m.provenance,'$.childRevisionId') WHERE m.parentLocationId=${parentId}`)
    expect(joins).toHaveLength(2)
    expect(new Set(joins.map(row => row.child)).size).toBe(2)
    expect(
      joins.every(row => row.pinned === row.child && row.parent !== row.child),
    ).toBe(true)
    const facts = readLocationFacts(row.facts)
    expect(facts.names).toEqual({ en: 'First building' })
    expect(facts.location.address.authored?.i18n.en).toMatchObject({
      buildingName: 'First building',
      streetName: 'Tak Ku Ling Road',
      buildingNumberFrom: '36',
      buildingNumberTo: '38',
    })
    const address = emptyFeatureAddress()
    address.source = readLocationFacts(row.facts).location.address
    expect(getAddressDisplay(address, 'en', [], 'building')).toBe(
      '36–38 Tak Ku Ling Road',
    )
  })
  it('designates the existing import once and attaches other buildings without changing its profile', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const first = member('first', '57')
    const second = member('second', '59')
    const parent = await importBuildingLocation(db, 'p', first.source, 'shared', 'user')
    const versions = () =>
      db.all<{ facts: string }>(
        sql`SELECT facts FROM locationRevisionContent WHERE locationId=${parent.locationId} ORDER BY version`,
      )
    const roles = (id: string) => readBuildingProfileRoles(db, id, 'p')
    expect(await roles(parent.locationId)).toEqual({
      physical: false,
      constituent: false,
    })
    const baseline = await versions()
    await expect(
      designatePhysicalBuilding(db, parent.locationId, 'other', 'user'),
    ).rejects.toMatchObject({ status: 409 })
    await designatePhysicalBuilding(db, parent.locationId, 'p', 'user')
    await designatePhysicalBuilding(db, parent.locationId, 'p', 'user')
    expect(await versions()).toEqual([...baseline, ...baseline])
    const findParents = async (organisationId: string, physicalParentFor: string) =>
      (
        await listLocationResources(db, {
          organisationId,
          physicalParents: { excludeLocationId: physicalParentFor },
          q: 'First building',
          searchAddress: true,
        })
      ).data.map(row => row.id)
    expect(await findParents('p', 'another-import')).toEqual([parent.locationId])
    expect(await findParents('other', 'another-import')).toEqual([])
    expect(await findParents('p', parent.locationId)).toEqual([])
    const target = { parentId: parent.locationId }
    await expect(
      savePhysicalBuildingMember(db, 'p', 'user', target, first),
    ).rejects.toMatchObject({ status: 409 })
    const placement = emptyFeatureAddress()
    placement.coordinates = second.coordinates
    const existing = await createLocalLocation(
      db,
      'p',
      localIdentityFromAddress('building', {}, placement),
      'user',
      {
        locationId: 'previously-imported-building',
        buildingSource: second.source,
      },
    )
    const selected = {
      ...second,
      childLocationId: existing.locationId,
      childRevisionId: existing.revisionId,
    }
    for (let attempt = 0; attempt < 2; attempt++)
      expect(await savePhysicalBuildingMember(db, 'p', 'user', target, selected)).toBe(
        parent.locationId,
      )
    const edges = await db.all<{ child: string; parent: string }>(
      sql`SELECT childLocationId child,parentLocationId parent FROM locationMembershipHead`,
    )
    expect(edges).toHaveLength(1)
    expect(edges[0].parent).toBe(parent.locationId)
    expect(edges[0].child).toBe(existing.locationId)
    expect(await roles(parent.locationId)).toEqual({
      physical: true,
      constituent: false,
    })
    expect(await roles(existing.locationId)).toEqual({
      physical: false,
      constituent: true,
    })
    await designatePhysicalBuilding(db, existing.locationId, 'p', 'user')
    expect(await roles(existing.locationId)).toEqual({
      physical: true,
      constituent: true,
    })
    await db.run(sql`INSERT INTO locationMembership(id,relationshipId,scopeOrganisationId,assertionState,childLocationId,parentLocationId,membershipState)
      SELECT 'hide-child',relationshipId,'p','suppressed',childLocationId,parentLocationId,'current' FROM locationMembershipHead WHERE childLocationId=${existing.locationId}`)
    expect(await roles(existing.locationId)).toEqual({
      physical: true,
      constituent: false,
    })
    expect(await readBuildingProfileRoles(db, existing.locationId, null)).toEqual({
      physical: true,
      constituent: true,
    })
    expect(await versions()).toEqual([...baseline, ...baseline, ...baseline])
  })
  it('finds an earlier combined parent and saves only explicitly selected constituents under its existing identity', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const placement = emptyFeatureAddress()
    placement.coordinates = [114.19, 22.32]
    placement.overrides.en = { formattedAddress: 'Corner entrance' }
    const first = member('first', '57')
    const second = member('second', '59')
    const { locationId } = await createLocalLocation(
      db,
      'p',
      localIdentityFromAddress('building', { en: 'Corner Building' }, placement),
      'user',
      undefined,
      {
        review: 'explicit-physical-building',
        references: [
          { type: 'saanseoi', source: first.source },
          { type: 'saanseoi', source: second.source },
        ],
      },
    )
    const read = () =>
      db.get<{ facts: string; members: string }>(sql`
      SELECT facts,${physicalBuildingMembers(sql`r.locationId`, 'p')} members FROM locationRevisionContent r
      WHERE r.locationId=${locationId} ORDER BY version DESC LIMIT 1`)
    const before = await read()
    expect(JSON.parse(before.members)).toEqual([])
    expect(await readBuildingProfileRoles(db, locationId, 'p')).toEqual({
      physical: true,
      constituent: false,
    })
    for (const org of ['p', 'other']) {
      const page = await listLocationResources(db, {
        organisationId: org,
        physicalParents: {},
        q: 'Corner Building',
        searchAddress: true,
      })
      expect(page.data.map(row => row.id)).toEqual(org === 'p' ? [locationId] : [])
    }
    for (const child of [first, second, first])
      await savePhysicalBuildingMember(db, 'p', 'user', { parentId: locationId }, child)
    const after = await read()
    expect(JSON.parse(after.members)).toMatchObject([first, second])
    expect(JSON.parse(after.facts)).toEqual(JSON.parse(before.facts))
  })
  it('labels physical and constituent roles independently using effective scoped membership', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const parent = await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { requestId: 'parent' },
      member('first', '36'),
    )
    const child = await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { requestId: 'child' },
      member('second', '38'),
    )
    expect(await readBuildingProfileRoles(db, parent, 'p')).toEqual({
      physical: true,
      constituent: false,
    })
    const imported = await importBuildingLocation(
      db,
      'p',
      member('ordinary', '40').source,
      'shared',
      'user',
    )
    expect(await readBuildingProfileRoles(db, imported.locationId, 'p')).toEqual({
      physical: false,
      constituent: false,
    })
    await db.run(sql`INSERT INTO locationMembership(id,relationshipId,scopeOrganisationId,assertionState,childLocationId,parentLocationId,membershipState)
      VALUES ('nested','nested',NULL,'asserted',${child},${parent},'current')`)
    expect(await readBuildingProfileRoles(db, child, 'p')).toEqual({
      physical: true,
      constituent: true,
    })
    await db.run(sql`INSERT INTO locationMembership(id,relationshipId,scopeOrganisationId,assertionState,childLocationId,parentLocationId,membershipState)
      VALUES ('hidden','nested','p','suppressed',${child},${parent},'current')`)
    expect(await readBuildingProfileRoles(db, child, 'p')).toEqual({
      physical: true,
      constituent: false,
    })
    expect(await readBuildingProfileRoles(db, child, null)).toEqual({
      physical: true,
      constituent: true,
    })
  })
  it('fills a legacy parent from its pinned member and a second refresh creates no revision', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const a = member('first', '57-59', 'Lung Kong Road')
    const child = await importBuildingLocation(db, 'p', a.source, 'shared', 'user')
    const placement = emptyFeatureAddress()
    placement.coordinates = a.coordinates
    const input = localIdentityFromAddress('building', {}, placement)
    delete input.facts.location.address.authored
    input.facts.location.address.fallbackDisplay = physicalBuildingAddresses([a])
    const { locationId } = await createLocalLocation(db, 'p', input, 'user', {
      locationId: 'legacy-building',
      physicalBuildingMember: {
        ...a,
        childLocationId: child.locationId,
        childRevisionId: child.revisionId,
      },
    })
    for (let attempt = 0; attempt < 2; attempt++)
      await savePhysicalBuildingMember(db, 'p', 'user', { parentId: locationId })
    const head = await db.get<{ version: number; facts: string; members: string }>(
      sql`SELECT version,facts,${physicalBuildingMembers(sql`r.locationId`)} members FROM locationRevisionContent r WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1`,
    )
    expect(head.version).toBe(2)
    expect(JSON.parse(head.members)).toHaveLength(1)
    expect(readLocationFacts(head.facts)).toMatchObject({
      names: { en: 'First building' },
      location: {
        address: {
          authored: {
            i18n: {
              en: {
                streetName: 'Lung Kong Road',
                buildingNumberFrom: '57',
                buildingNumberTo: '59',
              },
            },
          },
        },
      },
    })
  })
  it('retains the edited parent name and custom address when another child is added', async () => {
    const { db } = setupLocationServiceDatabase(true)
    const parentId = await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { requestId: 'named' },
      member('first', '36'),
    )
    const initial = await db.get<{ id: string }>(
      sql`SELECT id FROM locationRevision WHERE locationId=${parentId}`,
    )
    expect(
      await updateLocalLocationAddress(db, {
        locationId: parentId,
        organisationId: 'p',
        expectedRevisionId: initial.id,
        actorId: 'user',
        allowSharedBaseline: true,
        names: { en: 'Corner Building' },
        address: createLocalLocationAddress(),
        displayOverrides: { en: 'The main entrance, Tak Ku Ling Road' },
      }),
    ).toBeTruthy()
    await savePhysicalBuildingMember(
      db,
      'p',
      'user',
      { parentId },
      member('second', '38'),
    )
    const head = await db.get<{ facts: string; members: string }>(
      sql`SELECT facts,${physicalBuildingMembers(sql`r.locationId`)} members FROM locationRevisionContent r WHERE locationId=${parentId} ORDER BY version DESC LIMIT 1`,
    )
    const facts = readLocationFacts(head.facts)
    expect(facts.names.en).toBe('Corner Building')
    expect(facts.location.address.displayOverrides?.en).toBe(
      'The main entrance, Tak Ku Ling Road',
    )
    expect(facts.location.address.fallbackDisplay.en).toBe('36–38 Tak Ku Ling Road')
    expect(JSON.parse(head.members)).toHaveLength(2)
  })
})
