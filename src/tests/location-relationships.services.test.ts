// @vitest-environment node
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import {
  appendLocationRelationship,
  readLocationRelationships,
} from '#lib/db/services/locationRelationships.js'
import type { RelationshipInput } from '#lib/locations/relationships.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})
function setup() {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  s.sqlite.exec(`INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES
   ('shop','establishment','unresolved','p'),('tower','building','unresolved','p'),
   ('mall','premises','unresolved','p'),('campus','premises','unresolved','p'),
   ('private','building','manual','other');`)
  return s
}
const base = {
  previousRevisionId: null,
  scopeOrganisationId: null,
  assertionState: 'asserted' as const,
  evidence: [],
  observedAt: null,
  verifiedAt: null,
  effectiveFrom: null,
  effectiveTo: null,
}
function occupancy(id = 'episode'): RelationshipInput {
  return {
    ...base,
    table: 'locationOccupancy',
    id,
    relationshipId: id,
    establishmentLocationId: 'shop',
    containerLocationId: 'tower',
    addressRevisionId: null,
    occupancyState: 'current',
  }
}
function membership(
  id: string,
  childLocationId: string,
  parentLocationId: string,
): RelationshipInput {
  return {
    ...base,
    table: 'locationMembership',
    id,
    relationshipId: id,
    childLocationId,
    parentLocationId,
    membershipState: 'current',
  }
}
it.each(['private', 'wrong-kind'] as const)(
  'fences a %s occupancy endpoint at insertion time',
  async change => {
    const { db, sqlite } = setup()
    const run = db.run.bind(db)
    vi.spyOn(db, 'run').mockImplementationOnce(query => {
      const insert = run(query)
      const execute = insert.execute.bind(insert)
      vi.spyOn(insert, 'execute').mockImplementationOnce(async () => {
        // Change the endpoint after canonical resolution but before the database write.
        if (change === 'private')
          sqlite.exec("UPDATE location SET state='manual' WHERE id='tower'")
        else sqlite.exec("UPDATE location SET kind='natural' WHERE id='tower'")
        return execute()
      })
      return insert
    })
    await expect(
      appendLocationRelationship(db, occupancy(), 'editor'),
    ).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: expect.stringContaining(
          change === 'private'
            ? 'Relationship endpoint unavailable in scope'
            : 'Occupancy requires an establishment and building or premises',
        ),
      }),
    })
    expect(sqlite.prepare('SELECT count(*) n FROM locationOccupancy').get()?.n).toBe(0)
  },
)

it.each([null, 'other', 'p'])(
  'scopes retained relationship evidence to %s',
  async scope => {
    const { db, sqlite } = setup()
    await appendLocationRelationship(
      db,
      { ...occupancy(), scopeOrganisationId: 'p' },
      'editor',
    )
    const input: RelationshipInput = {
      ...membership('citing-membership', 'tower', 'mall'),
      scopeOrganisationId: scope,
      evidence: [
        {
          source: {
            kind: 'record',
            resourceType: 'locationOccupancy',
            revisionId: 'episode',
          },
          supports: ['parentLocationId'],
          quotedText: 'Private tenancy observation',
          description: null,
          sourceDate: null,
        },
      ],
    }
    if (scope === 'p') {
      expect(await appendLocationRelationship(db, input, 'editor')).toBe(
        'citing-membership',
      )
      const rows = await readLocationRelationships(db, 'tower', 'p')
      expect(rows.locationMembership).toHaveLength(1)
      // Catalogue reads do not expose evidence text even to a reader of the assertion.
      expect(rows.locationMembership[0]).not.toHaveProperty('evidence')
      expect(rows.locationMembership[0]).not.toHaveProperty('actorId')
      expect(rows.locationMembership[0]).not.toHaveProperty('provenance')
    } else {
      await expect(appendLocationRelationship(db, input, 'editor')).rejects.toThrow(
        'Evidence reference unavailable in this scope',
      )
      expect(sqlite.prepare('SELECT count(*) n FROM locationMembership').get()?.n).toBe(
        0,
      )
    }
  },
)
