// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
vi.mock('#lib/sources/saanseoi.js', async original => ({
  ...(await original<typeof import('#lib/sources/saanseoi.js')>()),
  loadBuildingNames: async () => ({
    release: 'publication',
    records: ['first', 'second'].map(id => ({ id, names: {} })),
  }),
  loadBuildingDetails: async (id: string) => ({
    id,
    coordinates: [114.19, 22.32],
    addresses: [],
  }),
}))
import { sql } from 'drizzle-orm'
import { updateLocalLocationAddress } from '#lib/db/services/locationLocal.js'
import { createLocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import {
  physicalBuildingMembers,
  savePhysicalBuildingMember,
} from '#lib/db/services/physicalBuilding.js'
import {
  physicalBuildingAddresses,
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
  it('groups distinct frontages, ranges and suffixes numerically, retaining unparsed addresses', () => {
    const unknown = member('unknown', '')
    unknown.addresses[0].streets = {}
    unknown.addresses[0].display.en = 'Market Annex'
    const members = [
      member('a', '10B'),
      member('b', '2–8'),
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
    const address = emptyFeatureAddress()
    address.source = readLocationFacts(row.facts).location.address
    expect(getAddressDisplay(address, 'en', [], 'building')).toBe(
      '36–38 Tak Ku Ling Road',
    )
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
