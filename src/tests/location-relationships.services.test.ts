// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import {
  appendLocationRelationship,
  appendLocationTransition,
  readLocationRelationships,
} from '#lib/db/services/locationRelationships.js'
import {
  readOrganisationLocation,
  prepareOrganisationLocationWrite,
} from '#lib/db/services/organisationLocation.js'
import { validKnownDate, TransitionInputSchema } from '#lib/locations/relationships.js'
import { sql } from 'drizzle-orm'
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
describe('immutable Location lifecycle storage', () => {
  it('preserves old occupancy and rejects forks while replaying the same request once', async () => {
    const { db, sqlite } = setup()
    await appendLocationRelationship(db, occupancy(), 'editor')
    await appendLocationRelationship(db, occupancy(), 'editor')
    await appendLocationRelationship(
      db,
      {
        ...occupancy(),
        id: 'ended',
        previousRevisionId: 'episode',
        occupancyState: 'former',
        effectiveTo: { value: '2020', precision: 'year' },
      } as RelationshipInput,
      'editor',
    )
    expect(sqlite.prepare('SELECT count(*) n FROM locationOccupancy').get()?.n).toBe(2)
    expect(
      sqlite
        .prepare("SELECT occupancyState s FROM locationOccupancy WHERE id='episode'")
        .get()?.s,
    ).toBe('current')
    await expect(
      appendLocationRelationship(
        db,
        { ...occupancy(), id: 'fork', previousRevisionId: 'episode' },
        'editor',
      ),
    ).rejects.toThrow()
    expect(() =>
      sqlite.exec("DELETE FROM locationOccupancy WHERE id='ended'"),
    ).toThrow()
  })
  it('resolves suppression within its scope without converting it into former tenancy', async () => {
    const { db } = setup()
    await appendLocationRelationship(db, occupancy(), 'editor')
    await appendLocationRelationship(
      db,
      {
        ...occupancy(),
        id: 'scoped',
        scopeOrganisationId: 'p',
        assertionState: 'suppressed',
      },
      'editor',
    )
    const shared = await readLocationRelationships(db, 'tower', null)
    const scoped = await readLocationRelationships(db, 'tower', 'p')
    expect(shared.locationOccupancy[0].id).toBe('episode')
    expect(scoped.locationOccupancy[0].assertionState).toBe('suppressed')
    expect(scoped.locationOccupancy[0].occupancyState).toBe('current')
  })
  it('rejects private endpoints, invalid kinds, and nested membership cycles', async () => {
    const { db } = setup()
    await expect(
      appendLocationRelationship(
        db,
        { ...occupancy(), containerLocationId: 'private' } as RelationshipInput,
        'editor',
      ),
    ).rejects.toThrow()
    await expect(
      appendLocationRelationship(db, membership('bad', 'shop', 'mall'), 'editor'),
    ).rejects.toThrow()
    await appendLocationRelationship(
      db,
      membership('nested', 'mall', 'campus'),
      'editor',
    )
    await expect(
      appendLocationRelationship(db, membership('cycle', 'campus', 'mall'), 'editor'),
    ).rejects.toThrow()
    await appendLocationRelationship(
      db,
      membership('tower-group', 'tower', 'mall'),
      'editor',
    )
  })
  it('keeps correction rows immutable and returns exact historical versions', async () => {
    const { db, sqlite } = setup()
    const first = await prepareOrganisationLocationWrite(db, {
      organisationId: 'p',
      locationId: 'shop',
      actorId: 'editor',
      overrides: { names: { en: { mode: 'override', value: 'First' } } },
      guard: sql`1`,
    })
    await db.batch(first.queries as never)
    const second = await prepareOrganisationLocationWrite(db, {
      organisationId: 'p',
      locationId: 'shop',
      actorId: 'editor',
      overrides: {},
      guard: sql`1`,
    })
    await db.batch(second.queries as never)
    expect(
      (await readOrganisationLocation(db, 'p', 'shop', first.revision))?.overrides.names
        ?.en,
    ).toEqual({ mode: 'override', value: 'First' })
    expect((await readOrganisationLocation(db, 'p', 'shop'))?.overrides).toEqual({})
    expect(sqlite.prepare('SELECT count(*) n FROM organisationLocation').get()?.n).toBe(
      2,
    )
    expect(() =>
      sqlite.exec("UPDATE organisationLocation SET overrides='{}'"),
    ).toThrow()
  })
  it('retains multi-building replacement participants atomically without redirecting identities', async () => {
    const { db, sqlite } = setup()
    const input = TransitionInputSchema.parse({
      ...base,
      id: 'rebuild',
      relationshipId: 'rebuild',
      type: 'replacement',
      basis: 'real_world',
      before: ['tower'],
      after: ['mall', 'campus'],
      evidence: [
        {
          source: {
            kind: 'url',
            url: 'https://example.org/redevelopment',
            accessedAt: '2026-10-22T00:00:00Z',
          },
          supports: ['before', 'after'],
          quotedText: null,
          description: 'Synthetic redevelopment evidence',
          sourceDate: null,
        },
      ],
    })
    await appendLocationTransition(db, input, 'editor')
    expect(
      sqlite.prepare('SELECT count(*) n FROM locationTransitionParticipant').get()?.n,
    ).toBe(3)
    expect(
      sqlite.prepare("SELECT redirectTargetId FROM location WHERE id='tower'").get()
        ?.redirectTargetId,
    ).toBeNull()
    await expect(
      appendLocationTransition(
        db,
        {
          ...input,
          id: 'private-event',
          relationshipId: 'private-event',
          after: ['private'],
        },
        'editor',
      ),
    ).rejects.toThrow()
    expect(
      sqlite
        .prepare("SELECT id FROM locationTransition WHERE id='private-event'")
        .get(),
    ).toBeUndefined()
  })
  it('flattens populated correction history while preserving an older accepted token', async () => {
    const first = {
      revision: 'old-first',
      overrides: { names: { en: { mode: 'override', value: 'First' } } },
      actorId: 'editor',
      createdAt: '2020-01-01T00:00:00Z',
    }
    const last = {
      revision: 'old-last',
      overrides: {},
      actorId: 'editor',
      createdAt: '2021-01-01T00:00:00Z',
    }
    const store = setupLifecycleDatabase(true, true, sqlite => {
      sqlite.exec(
        "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('legacy','unknown','manual','p')",
      )
      sqlite
        .prepare(
          "INSERT INTO locationRevision(id,locationId,sequence,origin,contentHash,payload,facts) VALUES('legacy-r','legacy',1,'local','hash','{}',?)",
        )
        .run(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'unknown',
            common: {
              names: {},
              location: { geometry: { type: 'Point', coordinates: [114, 22] } },
            },
            details: {},
          }),
        )
      sqlite
        .prepare(
          "INSERT INTO organisationLocation(organisationId,locationId,revision,overrides,history,actorId) VALUES('p','legacy','old-last','{}',?,'editor')",
        )
        .run(JSON.stringify([first, last]))
      sqlite.exec(
        "INSERT INTO featureLocation(featureId,locationId,factsRevisionId,locationRevisionId,factsOrganisationRevision) VALUES('f','legacy','legacy-r','legacy-r','old-first')",
      )
    })
    stores.push(store)
    expect(
      (await readOrganisationLocation(store.db, 'p', 'legacy', 'old-first'))?.overrides,
    ).toEqual(first.overrides)
    expect(
      store.sqlite
        .prepare(
          "SELECT previousRevisionId FROM organisationLocation WHERE id='old-last'",
        )
        .get()?.previousRevisionId,
    ).toBe('old-first')
    expect(
      store.sqlite
        .prepare('SELECT factsOrganisationRevision FROM featureLocation')
        .get()?.factsOrganisationRevision,
    ).toBe('old-first')
    expect(store.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('groups accepted pins from exact relationships while later tenancy corrections leave placement alone', async () => {
    const { db, sqlite } = setup()
    await appendLocationRelationship(db, occupancy(), 'editor')
    await appendLocationRelationship(db, membership('path', 'tower', 'mall'), 'editor')
    sqlite
      .prepare(
        "INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES('shop-r','shop',1,'local','hash','{}',?)",
      )
      .run(
        JSON.stringify({
          schemaVersion: 1,
          kind: 'establishment',
          common: {
            names: {},
            location: { geometry: { type: 'Point', coordinates: [114, 22] } },
          },
          details: { brands: [] },
        }),
      )
    sqlite.exec(`INSERT INTO featureLocation(featureId,locationId,version,factsRevisionId,locationRevisionId,occupancyRevisionId,membershipRevisionIds)
      VALUES('f','shop','accepted','shop-r','shop-r','episode','["path"]')`)
    await appendLocationRelationship(
      db,
      {
        ...occupancy(),
        id: 'former',
        previousRevisionId: 'episode',
        occupancyState: 'former',
      } as RelationshipInput,
      'editor',
    )
    expect(
      sqlite
        .prepare(
          'SELECT containerLocationId FROM featureLocationMembership ORDER BY containerLocationId',
        )
        .all()
        .map(row => row.containerLocationId),
    ).toEqual(['mall', 'tower'])
    expect(
      sqlite.prepare('SELECT occupancyRevisionId FROM featureLocation').get()
        ?.occupancyRevisionId,
    ).toBe('episode')
    sqlite.exec("DELETE FROM featureLocation WHERE featureId='f'")
    expect(
      sqlite.prepare('SELECT count(*) n FROM featureLocationMembership').get()?.n,
    ).toBe(0)
    expect(
      sqlite
        .prepare(
          "SELECT occupancyRevisionId FROM featureLocationHistory WHERE action='unlink'",
        )
        .get()?.occupancyRevisionId,
    ).toBe('episode')
  })
  it('validates actual dates at their supported precision', () => {
    expect(validKnownDate('2024-02-29', 'day')).toBe(true)
    expect(validKnownDate('2023-02-29', 'day')).toBe(false)
    expect(validKnownDate('1980', 'decade')).toBe(true)
    expect(validKnownDate('1987', 'decade')).toBe(false)
    expect(validKnownDate('1987-13', 'month')).toBe(false)
  })
})

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
