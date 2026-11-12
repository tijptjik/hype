// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, expect, it, vi } from 'vitest'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'
// SERVICES
import {
  readLocationAccessibility,
  saveLocationAccessibility as saveWithRights,
} from '#lib/db/services/locationAccessibility.js'
import { appendLocationRelationship } from '#lib/db/services/locationRelationships.js'
import { sharedLocationFacts } from '#lib/db/services/locationShared.js'
// DOMAIN
import {
  AccessibilitySchema,
  UNKNOWN_ACCESSIBILITY,
} from '#lib/locations/accessibility.js'
import {
  createLocationFactsSnapshot,
  readLocationFacts,
} from '#lib/locations/factsSnapshot.js'
import type { LocationFacts } from '#lib/locations/model.js'

const saveLocationAccessibility = (
  db: Parameters<typeof saveWithRights>[0],
  input: Parameters<typeof saveWithRights>[1],
  actor: string,
) => saveWithRights(db, input, actor, { canEdit: true, superAdmin: false })
const stores: ReturnType<typeof setupLifecycleDatabase>[] = []
afterEach(() => {
  for (const s of stores.splice(0)) s.sqlite.close()
})
const values = {
  ...UNKNOWN_ACCESSIBILITY,
  wheelchair: 'limited' as const,
  stepFreeEntrance: 'yes' as const,
  lift: 'not_needed' as const,
}
function setup() {
  const s = setupLifecycleDatabase(true)
  stores.push(s)
  s.sqlite.exec(readFileSync('migrations/0155_location_accessibility.sql', 'utf8'))
  s.sqlite.exec(readFileSync('migrations/0209_shared_location_corrections.sql', 'utf8'))
  // This focused legacy harness uses the current localized snapshot envelope and matching adapter.
  s.sqlite.exec(
    'ALTER TABLE location ADD COLUMN matchingType TEXT GENERATED ALWAYS AS (kind) VIRTUAL',
  )
  const snapshotGuard = readFileSync(
    'migrations/0142_location_facts_snapshots.sql',
    'utf8',
  ).split('CREATE TRIGGER location_revision_snapshot_insert')[1]
  s.sqlite.exec(
    'DROP TRIGGER location_revision_snapshot_insert; CREATE TRIGGER location_revision_snapshot_insert' +
      snapshotGuard.replace('$.common.names', '$.i18n'),
  )

  for (const [id, kind, state] of [
    ['shop', 'establishment', 'unresolved'],
    ['tower', 'building', 'unresolved'],
    ['private', 'establishment', 'manual'],
  ] as const) {
    s.sqlite
      .prepare(
        'INSERT INTO location(id,kind,state,ownerOrganisationId) VALUES (?,?,?,?)',
      )
      .run(id, kind, state, 'p')
    revision(s, id, kind)
  }
  return s
}
function revision(
  s: ReturnType<typeof setupLifecycleDatabase>,
  id: string,
  kind: 'establishment' | 'building',
  version = 1,
  longitude = 114,
) {
  const facts: LocationFacts = {
    names: { en: id },
    phoneNumber: [],
    brands: [],
    location: {
      geometry: { type: 'Point', coordinates: [longitude, 22] },
      address: {
        status: 'unresolved',
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        snapshotId: null,
        rawSource: {},
        fallbackDisplay: {},
      },
    },
  }
  s.sqlite
    .prepare(
      "INSERT INTO locationRevision(id,locationId,version,origin,contentHash,rawSource,facts) VALUES (?,?,?,'local',?,'{}',?)",
    )
    .run(
      `${id}-${version}`,
      id,
      version,
      `${id}-${version}`,
      JSON.stringify(createLocationFactsSnapshot(facts, kind)),
    )
}
async function occupy(
  s: ReturnType<typeof setupLifecycleDatabase>,
  id = 'occupancy',
  state: 'current' | 'former' = 'current',
  scope: string | null = null,
  establishment = 'shop',
) {
  return appendLocationRelationship(
    s.db,
    {
      table: 'locationOccupancy',
      id,
      relationshipId: state === 'former' ? 'occupancy' : id,
      previousRevisionId: state === 'former' ? 'occupancy' : null,
      scopeOrganisationId: scope,
      assertionState: 'asserted',
      evidence: [],
      observedAt: null,
      verifiedAt: null,
      effectiveFrom: null,
      effectiveTo: null,
      establishmentLocationId: establishment,
      containerLocationId: 'tower',
      addressRevisionId: null,
      occupancyState: state,
    },
    'actor',
  )
}
async function save(
  s: ReturnType<typeof setupLifecycleDatabase>,
  id = 'shop',
  expectedId: string | null = null,
  version = 1,
) {
  return saveLocationAccessibility(
    s.db,
    {
      locationId: id,
      expectedId,
      expectedLocationRevisionId: `${id}-${version}`,
      values,
    },
    'actor',
  )
}
it('keeps four independent values, unknowns and immutable history; rejects stale edits and clears explicitly', async () => {
  const s = setup()
  expect((await readLocationAccessibility(s.db, 'shop'))?.record).toBeNull()
  const first = await save(s)
  expect((await readLocationAccessibility(s.db, 'shop'))?.record?.values).toEqual(
    values,
  )
  const source = s.sqlite
    .prepare("SELECT facts FROM locationRevision WHERE id='shop-1'")
    .get()
  const projected = await sharedLocationFacts(
    s.db,
    'shop',
    readLocationFacts(source?.facts),
  )
  expect(projected.facts.accessibility).toEqual(values)
  await expect(save(s)).rejects.toThrow('ACCESSIBILITY_CHANGED')
  await saveLocationAccessibility(
    s.db,
    {
      locationId: 'shop',
      expectedId: first,
      expectedLocationRevisionId: 'shop-1',
      values: UNKNOWN_ACCESSIBILITY,
    },
    'second-actor',
  )
  expect((await readLocationAccessibility(s.db, 'shop'))?.record?.values).toEqual(
    UNKNOWN_ACCESSIBILITY,
  )
  expect(
    s.sqlite.prepare('SELECT COUNT(*) n FROM locationAccessibility').get()?.n,
  ).toBe(0)
  expect(
    s.sqlite.prepare('SELECT COUNT(*) n FROM locationSharedRevision').get()?.n,
  ).toBe(2)
  expect(() => s.sqlite.exec("UPDATE locationSharedRevision SET actorId='x'")).toThrow(
    'immutable',
  )
  expect(() => s.sqlite.exec('DELETE FROM locationSharedRevision')).toThrow('immutable')
})
it('shows a named venue report without assigning any of its values to the building', async () => {
  const s = setup()
  await occupy(s)
  await save(s)
  const building = await readLocationAccessibility(s.db, 'tower')
  expect(building?.record).toBeNull()
  expect(building?.venues).toHaveLength(1)
  expect(building?.venues[0]).toMatchObject({
    locationId: 'shop',
    names: { en: 'shop' },
    record: { values },
  })
  await saveLocationAccessibility(
    s.db,
    {
      locationId: 'tower',
      expectedId: null,
      expectedLocationRevisionId: 'tower-1',
      values: { ...UNKNOWN_ACCESSIBILITY, wheelchair: 'no' },
    },
    'actor',
  )
  expect(
    (await readLocationAccessibility(s.db, 'tower'))?.record?.values.wheelchair,
  ).toBe('no')
  expect(
    (await readLocationAccessibility(s.db, 'tower'))?.venues[0].record.values
      .wheelchair,
  ).toBe('limited')
})
it('never exposes private or Organisation-only occupancy and removes ended tenancy signals', async () => {
  const s = setup()
  expect(await readLocationAccessibility(s.db, 'private')).toBeNull()
  await expect(save(s, 'private')).rejects.toThrow()
  await occupy(s, 'scoped', 'current', 'p')
  await save(s)
  expect((await readLocationAccessibility(s.db, 'tower'))?.venues).toEqual([])
  await occupy(s)
  // A changed occupancy requires rechecking the old observation before aggregation.
  expect((await readLocationAccessibility(s.db, 'shop'))?.record?.stale).toBe(true)
  const head = (await readLocationAccessibility(s.db, 'shop'))!.record!.id
  await save(s, 'shop', head)
  expect((await readLocationAccessibility(s.db, 'tower'))?.venues).toHaveLength(1)
  await occupy(s, 'ended', 'former')
  expect((await readLocationAccessibility(s.db, 'tower'))?.venues).toEqual([])
})
it('retains observations across non-placement revisions but flags relocation and fences source changes', async () => {
  const s = setup()
  await occupy(s)
  const head = await save(s)
  revision(s, 'shop', 'establishment', 2)
  expect((await readLocationAccessibility(s.db, 'shop'))?.record?.stale).toBe(false)
  await expect(save(s, 'shop', head)).rejects.toThrow('ACCESSIBILITY_CHANGED')
  revision(s, 'shop', 'establishment', 3, 115)
  expect((await readLocationAccessibility(s.db, 'shop'))?.record?.stale).toBe(true)
  expect((await readLocationAccessibility(s.db, 'tower'))?.venues).toEqual([])
})
it('rejects inapplicable choices and evidence payloads', () => {
  expect(
    AccessibilitySchema.safeParse({ ...values, stepFreeEntrance: 'limited' }).success,
  ).toBe(false)
  expect(AccessibilitySchema.safeParse({ ...values, lift: 'limited' }).success).toBe(
    false,
  )
  expect(AccessibilitySchema.safeParse({ ...values, evidence: [] }).success).toBe(false)
})

it.each(['manual', 'natural'] as const)(
  'rejects a shared observation when its subject becomes %s before insertion',
  async state => {
    const s = setup()
    const get = s.db.get.bind(s.db)
    vi.spyOn(s.db, 'get').mockImplementationOnce(query => {
      const read = get(query)
      const execute = read.execute.bind(read)
      vi.spyOn(read, 'execute').mockImplementationOnce(async () => {
        const subject = await execute()
        // A lifecycle transition can retain the same immutable facts revision.
        if (state === 'natural')
          s.sqlite.exec("UPDATE location SET kind='natural' WHERE id='shop'")
        else
          s.sqlite.prepare('UPDATE location SET state=? WHERE id=?').run(state, 'shop')
        return subject
      })
      return read
    })
    await expect(save(s)).rejects.toThrow('ACCESSIBILITY_CHANGED')
    expect(
      s.sqlite.prepare('SELECT count(*) n FROM locationAccessibility').get()?.n,
    ).toBe(0)
  },
)
