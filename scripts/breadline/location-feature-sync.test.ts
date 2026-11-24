// BUN
import { Database } from 'bun:sqlite'
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// SYNC
import {
  deriveLocationSyncContent,
  mergeLocationSyncValue,
  adoptLocationSyncBaseline,
} from './lib/location-feature-sync'
import {
  applyLocationFeatureSyncGroup,
  type LocationSyncGroup,
} from './lib/location-feature-sync-contract'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
// TYPES
import type { FeatureRevisionContent } from '../../src/lib/revisions/featureContent'
import type { LocationFacts } from '../../src/lib/locations/model'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})
/** Build a disposable adapter for atomic sync guards. @returns Minimal revision/crosswalk database. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'location-sync-')),
    path = join(dir, 'db.sqlite')
  new Database(path).close()
  const d = openSqliteDomain(path)
  cleanups.push(() => {
    d.close()
    rmSync(dir, { recursive: true, force: true })
  })
  d.sqlite.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY,currentRevisionId TEXT);
 CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT);
 CREATE TABLE breadlineImportFeature(sourceTable TEXT,sourceId TEXT,featureId TEXT,sourceHash TEXT);
 INSERT INTO feature VALUES('f','r1'); INSERT INTO featureRevision VALUES('r1','f');
 INSERT INTO breadlineImportFeature VALUES('donors','1','f','old');`)
  return d
}
const group: LocationSyncGroup = {
  identity: 'donors:1',
  featureId: 'f',
  beforeRevision: 'r1',
  afterRevision: 'r2',
  sourceHash: 'new',
  statements: [
    { sql: "UPDATE feature SET currentRevisionId='r2' WHERE id='f'", params: [] },
    { sql: "UPDATE breadlineImportFeature SET sourceHash='new'", params: [] },
  ],
}
test('atomic failure rolls back, retry completes and lost response is idempotent', async () => {
  const d = fixture()
  await expect(
    applyLocationFeatureSyncGroup(d.binding, {
      ...group,
      statements: [...group.statements, { sql: "SELECT json('invalid')", params: [] }],
    }),
  ).rejects.toThrow()
  expect(d.sqlite.query('SELECT currentRevisionId FROM feature').get()).toEqual({
    currentRevisionId: 'r1',
  })
  await applyLocationFeatureSyncGroup(d.binding, group)
  await applyLocationFeatureSyncGroup(d.binding, group)
  expect(d.sqlite.query('SELECT sourceHash FROM breadlineImportFeature').get()).toEqual(
    { sourceHash: 'new' },
  )
  d.sqlite.exec("UPDATE feature SET currentRevisionId='independent'")
  await expect(applyLocationFeatureSyncGroup(d.binding, group)).rejects.toThrow('drift')
})
test('three-way reconciliation preserves independent edits and reports competing source edits', () => {
  const conflicts: string[] = []
  expect(mergeLocationSyncValue('old', 'old', 'curated', 'name', conflicts)).toBe(
    'curated',
  )
  expect(mergeLocationSyncValue('old', 'new', 'curated', 'name', conflicts)).toBe(
    'curated',
  )
  expect(conflicts).toEqual(['name'])
  expect(mergeLocationSyncValue('old', 'new', 'old', 'name', [])).toBe('new')
})
test('blank phones and unrelated source edits preserve curation, placement and templates', () => {
  const content = {
    translations: { en: { title: { value: 'Curated' } } },
    properties: { gPropPhNum01: { selection: { value: '["+85229722222"]' } } },
    profile: { visitability: { isVisitable: true }, nameTemplate: { en: 'template' } },
    placement: {
      addressMeta: {},
      location: {
        locationId: 'accepted',
        acceptedOverrides: {
          operatingStatus: { mode: 'override', value: 'permanently_closed' },
        },
      },
    },
  } as unknown as FeatureRevisionContent
  const before = {
    names: { en: 'Original' },
    phoneNumber: ['+85229722222'],
    location: { point: [1, 2] },
    brands: [],
  } as unknown as LocationFacts
  const row = {
    table: 'donors' as const,
    id: '767',
    hash: 'new',
    eligible: true,
    source: { active: 1 },
  }
  const result = deriveLocationSyncContent(
    content,
    before,
    { ...before, phoneNumber: [] },
    row,
    { ...row, hash: 'old' },
  )
  expect(result.conflicts).toEqual([])
  expect(result.content.properties.gPropPhNum01.selection.value).toBe(
    '["+85229722222"]',
  )
  expect(result.content.placement.location).toEqual(content.placement.location)
  expect(result.content.profile).toEqual(content.profile)
  expect(result.content.translations.en.title.value).toBe('Curated')
  const changed = deriveLocationSyncContent(
    content,
    before,
    {
      ...before,
      location: { changed: true },
      brands: ['other'],
    } as unknown as LocationFacts,
    row,
    row,
  )
  expect(changed.conflicts).toEqual([
    'location_requires_review',
    'brand_identity_requires_review',
  ])
})
test('adoption requires the original Feature identity and rejects extra crosswalks', () => {
  const d = fixture(),
    source = {
      snapshotAt: 'now',
      rows: [
        { table: 'donors' as const, id: '1', hash: 'old', eligible: true, source: {} },
      ],
    },
    facts = { 'donors:1': {} as LocationFacts }
  const legacy = {
    targetIdentity: 'target',
    source,
    planHash: 'hash',
    projections: { 'donors:1': { feature: [{ id: 'wrong' }] } },
  }
  expect(() => adoptLocationSyncBaseline(d, source, legacy, facts, 'target')).toThrow(
    'identity',
  )
  legacy.projections['donors:1'].feature[0].id = 'f'
  expect(adoptLocationSyncBaseline(d, source, legacy, facts, 'target').version).toBe(2)
  d.sqlite.exec("INSERT INTO breadlineImportFeature VALUES('donors','2','other','old')")
  expect(() => adoptLocationSyncBaseline(d, source, legacy, facts, 'target')).toThrow(
    'unexpected',
  )
})
