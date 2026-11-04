// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
// SERVICES
import {
  appendLocationRelationship,
  readLocationRelationships,
} from '#lib/db/services/locationRelationships.js'
// TYPES
import type { RelationshipInput } from '#lib/locations/relationships.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Arrange two authorised scopes and physical containers without manufacturing accepted placement.
 * @returns A real migrated database and transactional D1 adapter.
 */
function setup(): ReturnType<typeof setupLifecycleDatabase> {
  const store = setupLifecycleDatabase(true)
  stores.push(store)
  store.sqlite.exec(`INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES
    ('business','establishment','unresolved','p'),
    ('building','building','unresolved','p'),
    ('private-building','building','manual','other');`)
  return store
}

/** Build one independent tenancy episode; corrections must explicitly name a predecessor.
 * @param id Stable operation and relationship identity.
 * @returns Valid shared occupancy input.
 */
function episode(id: string): RelationshipInput {
  return {
    table: 'locationOccupancy',
    id,
    relationshipId: id,
    previousRevisionId: null,
    scopeOrganisationId: null,
    assertionState: 'asserted',
    evidence: [],
    observedAt: null,
    verifiedAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    establishmentLocationId: 'business',
    containerLocationId: 'building',
    addressRevisionId: null,
    occupancyState: 'current',
  }
}

describe('Location lifecycle scenario operations (Refs #194)', () => {
  it('N + V + Z: return episodes survive scoped suppression and rejected stale corrections', async () => {
    const { db, sqlite } = setup()
    const original = episode('first-visit')
    await appendLocationRelationship(db, original, 'editor')
    await appendLocationRelationship(
      db,
      {
        ...original,
        id: 'first-ended',
        previousRevisionId: original.id,
        occupancyState: 'former',
        effectiveTo: { value: '2020', precision: 'year' },
      } as RelationshipInput,
      'editor',
    )
    const returned = {
      ...episode('return-visit'),
      effectiveFrom: { value: '2022-03', precision: 'month' },
    } as RelationshipInput
    await appendLocationRelationship(db, returned, 'editor')
    await appendLocationRelationship(db, returned, 'editor')
    await appendLocationRelationship(
      db,
      {
        ...returned,
        id: 'hide-return',
        scopeOrganisationId: 'p',
        assertionState: 'suppressed',
      } as RelationshipInput,
      'editor',
    )

    const before = sqlite.prepare('SELECT * FROM locationOccupancy ORDER BY id').all()
    await expect(
      appendLocationRelationship(
        db,
        {
          ...original,
          id: 'stale-first-edit',
          previousRevisionId: original.id,
        },
        'editor',
      ),
    ).rejects.toThrow()
    await expect(
      appendLocationRelationship(
        db,
        {
          ...returned,
          occupancyState: 'unconfirmed',
        } as RelationshipInput,
        'editor',
      ),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM locationOccupancy ORDER BY id').all()).toEqual(
      before,
    )

    const shared = (await readLocationRelationships(db, 'building', null))
      .locationOccupancy
    const own = (await readLocationRelationships(db, 'building', 'p')).locationOccupancy
    const other = (await readLocationRelationships(db, 'building', 'other'))
      .locationOccupancy
    expect(shared.map(row => [row.relationshipId, row.occupancyState])).toEqual([
      ['first-visit', 'former'],
      ['return-visit', 'current'],
    ])
    expect(own.find(row => row.relationshipId === 'return-visit')?.assertionState).toBe(
      'suppressed',
    )
    expect(other).toEqual(shared)
    expect(sqlite.prepare('SELECT count(*) n FROM locationOccupancy').get()?.n).toBe(4)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('Y + Z: an owner-private episode never appears in shared or another Organisation view', async () => {
    const { db, sqlite } = setup()
    const privateEpisode = {
      ...episode('private-visit'),
      containerLocationId: 'private-building',
      scopeOrganisationId: 'other',
    } as RelationshipInput
    await appendLocationRelationship(db, privateEpisode, 'owner')
    expect(
      (await readLocationRelationships(db, 'business', null)).locationOccupancy,
    ).toEqual([])
    expect(
      (await readLocationRelationships(db, 'business', 'p')).locationOccupancy,
    ).toEqual([])
    expect(
      (await readLocationRelationships(db, 'business', 'other')).locationOccupancy,
    ).toHaveLength(1)
    await expect(
      appendLocationRelationship(
        db,
        {
          ...privateEpisode,
          id: 'leak',
          relationshipId: 'leak',
          scopeOrganisationId: null,
        },
        'owner',
      ),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT count(*) n FROM locationOccupancy').get()?.n).toBe(1)
  })
})
