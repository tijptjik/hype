// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
import {
  readRelationshipPage,
  readLocationLineage,
  reorderLocationAddresses,
} from '#lib/db/services/locationRelationshipReview.js'
import {
  appendLocationRelationship,
  appendLocationTransition,
} from '#lib/db/services/locationRelationships.js'

const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
function setup() {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  // Legacy lifecycle fixtures store the matching discriminator directly in kind.
  s.sqlite.exec(
    'ALTER TABLE location ADD COLUMN matchingType TEXT GENERATED ALWAYS AS (kind) VIRTUAL',
  )
  s.sqlite.exec(
    "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('building','building','unresolved','p'),('other-building','building','unresolved','p'),('private','building','manual','other')",
  )
  s.sqlite.exec(
    "INSERT INTO address(id,sourceKey) VALUES('a',json_object('provider','fixture','family','addresses','id','a')); INSERT INTO addressRevision(id,addressId,scope,contentHash,components,rawSource,sourceReferences) VALUES('ar','a','building','hash','{}','{}','[]')",
  )
  return s
}
async function address(s: ReturnType<typeof setup>, id: string) {
  await appendLocationRelationship(
    s.db,
    {
      table: 'locationAddress',
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
      locationId: 'building',
      addressRevisionId: 'ar',
      priority: null,
      addressState: 'current',
    },
    'editor',
  )
}
it('orders a complete set atomically, retains former versions, and replays exact operations', async () => {
  const s = setup()
  await address(s, 'one')
  await address(s, 'two')
  const input = {
    locationId: 'building',
    scope: 'p',
    expectedIds: ['two', 'one'],
    orderedIds: ['two', 'one'],
    operationId: 'order',
  }
  expect((await reorderLocationAddresses(s.db, input, 'editor')).status).toBe('applied')
  expect(
    s.sqlite.prepare("SELECT priority FROM locationAddress WHERE id='one'").get()
      ?.priority,
  ).toBeNull()
  expect(
    s.sqlite.prepare("SELECT priority FROM locationAddress WHERE id='order:0'").get()
      ?.priority,
  ).toBe(1)
  expect((await reorderLocationAddresses(s.db, input, 'editor')).status).toBe(
    'replayed',
  )
  expect(
    (
      await reorderLocationAddresses(
        s.db,
        { ...input, orderedIds: ['one', 'two'] },
        'editor',
      )
    ).status,
  ).toBe('conflict')
  expect(
    (await reorderLocationAddresses(s.db, { ...input, operationId: 'stale' }, 'editor'))
      .status,
  ).toBe('conflict')
  expect(
    s.sqlite.prepare('SELECT count(*) n FROM locationRelationshipOperation').get()?.n,
  ).toBe(1)
  const heads = await readRelationshipPage(s.db, {
    locationId: 'building',
    scope: 'p',
    table: 'locationAddress',
  })
  expect(heads.rows.map(r => r.id)).toEqual(['order:0', 'order:1'])
  expect(
    (
      await readRelationshipPage(s.db, {
        locationId: 'building',
        scope: null,
        table: 'locationAddress',
      })
    ).rows.map(r => r.id),
  ).toEqual(['one', 'two'])
})
it('rolls back the receipt and every successor when a later insert fails', async () => {
  const s = setup()
  await address(s, 'one')
  await address(s, 'two')
  s.sqlite.exec(
    "CREATE TRIGGER fail_order BEFORE INSERT ON locationAddress WHEN NEW.id='rollback:1' BEGIN SELECT RAISE(ABORT,'simulated failure'); END",
  )
  await expect(
    reorderLocationAddresses(
      s.db,
      {
        locationId: 'building',
        scope: null,
        expectedIds: ['one', 'two'],
        orderedIds: ['two', 'one'],
        operationId: 'rollback',
      },
      'editor',
    ),
  ).rejects.toThrow()
  expect(
    s.sqlite.prepare('SELECT count(*) n FROM locationRelationshipOperation').get()?.n,
  ).toBe(0)
  expect(s.sqlite.prepare('SELECT count(*) n FROM locationAddress').get()?.n).toBe(2)
})
it('fences empty operations and supports replay without a successor row', async () => {
  const s = setup()
  const input = {
    locationId: 'building',
    scope: null,
    expectedIds: [],
    orderedIds: [],
    operationId: 'empty',
  }
  expect((await reorderLocationAddresses(s.db, input, 'editor')).status).toBe('applied')
  expect((await reorderLocationAddresses(s.db, input, 'editor')).status).toBe(
    'replayed',
  )
  expect(
    (
      await reorderLocationAddresses(
        s.db,
        { ...input, locationId: 'private', operationId: 'private' },
        'editor',
      )
    ).status,
  ).toBe('conflict')
})
it('paginates immutable rows without exposing private endpoints or provenance', async () => {
  const s = setup()
  for (let i = 0; i < 28; i++) await address(s, 'address-' + String(i).padStart(2, '0'))
  const first = await readRelationshipPage(s.db, {
    locationId: 'building',
    scope: null,
    table: 'locationAddress',
  })
  expect(first.rows).toHaveLength(25)
  expect(first.rows[0]).not.toHaveProperty('provenance')
  const last = await readRelationshipPage(s.db, {
    locationId: 'building',
    scope: null,
    table: 'locationAddress',
    afterId: first.nextCursor!,
  })
  expect(last.rows).toHaveLength(3)
  expect(last.nextCursor).toBeNull()
  expect(new Set([...first.rows, ...last.rows].map(r => r.id)).size).toBe(28)
})
it('presents evidenced replacement lineage without redirecting either identity', async () => {
  const s = setup()
  await appendLocationTransition(
    s.db,
    {
      id: 'replacement',
      relationshipId: 'replacement',
      previousRevisionId: null,
      scopeOrganisationId: null,
      assertionState: 'asserted',
      type: 'replacement',
      basis: 'real_world',
      before: ['building'],
      after: ['other-building'],
      evidence: [
        {
          source: {
            kind: 'url',
            url: 'https://example.org/rebuild',
            accessedAt: '2026-10-22T00:00:00Z',
          },
          supports: ['before', 'after'],
          quotedText: null,
          description: 'Synthetic evidence',
          sourceDate: null,
        },
      ],
      observedAt: null,
      verifiedAt: null,
      effectiveFrom: { value: '1980', precision: 'decade' },
      effectiveTo: null,
    },
    'editor',
  )
  s.sqlite
    .prepare(
      'INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      'building-label',
      'building',
      1,
      'local',
      'fixture',
      '{}',
      JSON.stringify({ common: { names: { en: 'Harbour House' } } }),
    )
  const result = await readLocationLineage(s.db, {
    locationId: 'building',
    scope: null,
  })
  expect(result.rows).toHaveLength(1)
  expect(result.rows[0].participants).toHaveLength(2)
  expect(result.rows[0].participants).toContainEqual({
    locationId: 'building',
    side: 'before',
    label: 'Harbour House',
  })
  expect(
    s.sqlite.prepare("SELECT redirectTargetId FROM location WHERE id='building'").get()
      ?.redirectTargetId,
  ).toBeNull()
})
it('resolves alias visibility before pagination and does not leak private survivors', async () => {
  const s = setup()
  await address(s, 'aliased-address')
  s.sqlite.exec("UPDATE location SET redirectTargetId='private' WHERE id='building'")
  expect(
    (
      await readRelationshipPage(s.db, {
        locationId: 'private',
        scope: null,
        table: 'locationAddress',
      })
    ).rows,
  ).toEqual([])
  expect(
    (
      await readRelationshipPage(s.db, {
        locationId: 'private',
        scope: 'p',
        table: 'locationAddress',
      })
    ).rows,
  ).toEqual([])
  expect(
    (
      await readRelationshipPage(s.db, {
        locationId: 'private',
        scope: 'other',
        table: 'locationAddress',
      })
    ).rows,
  ).toHaveLength(1)
})
it.each(['merge', 'split', 'reconfiguration'] as const)(
  'retains %s lineage with all participants without inferring relocation',
  async type => {
    const s = setup()
    await appendLocationTransition(
      s.db,
      {
        id: type,
        relationshipId: type,
        previousRevisionId: null,
        scopeOrganisationId: 'p',
        assertionState: 'asserted',
        type,
        basis: 'real_world',
        before: ['building'],
        after: ['other-building'],
        evidence: [
          {
            source: {
              kind: 'url',
              url: 'https://example.org/event',
              accessedAt: '2026-10-22T00:00:00Z',
            },
            supports: ['before', 'after'],
            quotedText: null,
            description: 'Synthetic event evidence',
            sourceDate: null,
          },
        ],
        observedAt: null,
        verifiedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
      },
      'editor',
    )
    expect(
      (await readLocationLineage(s.db, { locationId: 'other-building', scope: 'p' }))
        .rows,
    ).toHaveLength(1)
    expect(
      (await readLocationLineage(s.db, { locationId: 'other-building', scope: null }))
        .rows,
    ).toEqual([])
    expect(s.sqlite.prepare('SELECT count(*) n FROM featureLocation').get()?.n).toBe(0)
    expect(
      s.sqlite
        .prepare('SELECT count(*) n FROM location WHERE redirectTargetId IS NOT NULL')
        .get()?.n,
    ).toBe(0)
  },
)
it('checks merge cycles within each resolved Organisation scope instead of combining incompatible assertions', async () => {
  const s = setup()
  const { assessMergeDependencies } = await import(
    '#lib/db/services/locationMergeImpact.js'
  )
  s.sqlite.exec(
    "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('a','premises','unresolved','p'),('b','premises','unresolved','p'),('c','premises','unresolved','p')",
  )
  for (const [id, scope, child, parent] of [
    ['ab', 'p', 'a', 'b'],
    ['bc', 'other', 'b', 'c'],
  ]) {
    await appendLocationRelationship(
      s.db,
      {
        table: 'locationMembership',
        id,
        relationshipId: id,
        previousRevisionId: null,
        scopeOrganisationId: scope,
        assertionState: 'asserted',
        childLocationId: child,
        parentLocationId: parent,
        membershipState: 'current',
        evidence: [],
        observedAt: null,
        verifiedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
      },
      'editor',
    )
  }
  expect((await assessMergeDependencies(s.db, 'a', 'c')).blockers).toEqual([])
  await appendLocationRelationship(
    s.db,
    {
      table: 'locationMembership',
      id: 'bc-own',
      relationshipId: 'bc-own',
      previousRevisionId: null,
      scopeOrganisationId: 'p',
      assertionState: 'asserted',
      childLocationId: 'b',
      parentLocationId: 'c',
      membershipState: 'current',
      evidence: [],
      observedAt: null,
      verifiedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
    },
    'editor',
  )
  expect((await assessMergeDependencies(s.db, 'a', 'c')).blockers).toContain(
    'membership-cycle-after-merge',
  )
})

it.each([false, true])(
  'hides lineage after a participant becomes private (history=%s)',
  async history => {
    const s = setup()
    await appendLocationTransition(
      s.db,
      {
        id: 'visibility-event',
        relationshipId: 'visibility-event',
        previousRevisionId: null,
        scopeOrganisationId: null,
        assertionState: 'asserted',
        type: 'replacement',
        basis: 'real_world',
        before: ['building'],
        after: ['other-building'],
        evidence: [
          {
            source: {
              kind: 'url',
              url: 'https://example.org/lineage',
              accessedAt: '2026-10-22T00:00:00Z',
            },
            supports: ['before', 'after'],
            quotedText: 'Synthetic retained event text',
            description: null,
            sourceDate: null,
          },
        ],
        observedAt: null,
        verifiedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
      },
      'editor',
    )
    const query = { locationId: 'building', history }
    expect(
      (await readLocationLineage(s.db, { ...query, scope: null })).rows,
    ).toHaveLength(1)
    s.sqlite.exec("UPDATE location SET state='manual' WHERE id='other-building'")
    for (const scope of [null, 'other']) {
      const denied = await readLocationLineage(s.db, { ...query, scope })
      expect(denied).toEqual({ rows: [], nextCursor: null })
    }
    const allowed = await readLocationLineage(s.db, { ...query, scope: 'p' })
    expect(allowed.rows).toHaveLength(1)
    expect(allowed.rows[0]).not.toHaveProperty('actorId')
    expect(allowed.rows[0]).not.toHaveProperty('provenance')
    expect(allowed.rows[0].participants).toHaveLength(2)
  },
)

it.each([false, true])(
  'rejects ordering when the subject becomes private before the batch (hasRows=%s)',
  async hasRows => {
    const s = setup()
    if (hasRows) await address(s, 'one')
    const batch = s.db.batch.bind(s.db)
    vi.spyOn(s.db, 'batch').mockImplementationOnce(queries => {
      s.sqlite.exec("UPDATE location SET state='manual' WHERE id='building'")
      return batch(queries)
    })
    expect(
      await reorderLocationAddresses(
        s.db,
        {
          locationId: 'building',
          scope: null,
          expectedIds: hasRows ? ['one'] : [],
          orderedIds: hasRows ? ['one'] : [],
          operationId: 'private-race',
        },
        'editor',
      ),
    ).toEqual({ status: 'conflict', ids: [] })
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationRelationshipOperation').get()?.n,
    ).toBe(0)
    expect(s.sqlite.prepare('SELECT count(*) n FROM locationAddress').get()?.n).toBe(
      hasRows ? 1 : 0,
    )
  },
)

it('invalidates merge evidence when an intermediate membership closes a transitive cycle', async () => {
  const s = setup()
  const { assessMergeDependencies } = await import(
    '#lib/db/services/locationMergeImpact.js'
  )
  s.sqlite.exec(
    "INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES('a','premises','unresolved','p'),('b','premises','unresolved','p'),('c','premises','unresolved','p'),('d','premises','unresolved','p')",
  )
  const edge = async (child: string, parent: string) =>
    appendLocationRelationship(
      s.db,
      {
        table: 'locationMembership',
        id: child + parent,
        relationshipId: child + parent,
        previousRevisionId: null,
        scopeOrganisationId: 'p',
        assertionState: 'asserted',
        childLocationId: child,
        parentLocationId: parent,
        membershipState: 'current',
        evidence: [],
        observedAt: null,
        verifiedAt: null,
        effectiveFrom: null,
        effectiveTo: null,
      },
      'editor',
    )
  await edge('a', 'b')
  await edge('c', 'd')
  const before = await assessMergeDependencies(s.db, 'a', 'd')
  expect(before.blockers).toEqual([])
  await edge('b', 'c')
  const after = await assessMergeDependencies(s.db, 'a', 'd')
  expect(after.blockers).toContain('membership-cycle-after-merge')
  expect(after.token).not.toBe(before.token)
})
