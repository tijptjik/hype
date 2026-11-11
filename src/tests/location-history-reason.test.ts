// @vitest-environment node
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// SERVICES
import { locationHistoryReason } from '#lib/db/services/locationHistoryReason.js'
// TYPES
import type { Database } from '#lib/types.js'

const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

describe.each(['organisationLocation', 'locationSharedRevision'])(
  '%s provenance',
  table => {
    it.each([
      ['staff-correction', 'Staff updated location'],
      ['location-editor', 'Staff updated location'],
      ['task-correction', 'Location contribution accepted'],
      ['unknown', 'Location updated'],
    ])(
      'describes legacy %s evidence without modifying history',
      async (kind, expected) => {
        const f = publicationSqlite({})
        stores.push(f)
        f.sqlite.exec(`CREATE TABLE featureRevision(id TEXT,featureId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
    CREATE TABLE revisionChangeSet(id TEXT,actorId TEXT);
    CREATE TABLE ${table}(id TEXT,locationId TEXT,actorId TEXT,provenance TEXT);
    INSERT INTO revisionChangeSet VALUES('change','staff');`)
        const content = JSON.stringify({
          placement: {
            location: {
              locationId: 'place',
              factsOrganisationRevision: 'pin',
              acceptancePolicy: { lastSharedRevision: 'pin' },
            },
          },
        })
        f.sqlite
          .prepare('INSERT INTO featureRevision VALUES(?,?,?,?,?)')
          .run('revision', 'feature', null, 'change', content)
        f.sqlite
          .prepare(`INSERT INTO ${table} VALUES(?,?,?,?)`)
          .run('pin', 'place', 'staff', JSON.stringify({ kind }))
        const input = {
          revisionId: 'revision',
          reason: 'Shared Location correction accepted',
        }
        expect(await locationHistoryReason(f.db as unknown as Database, input)).toBe(
          expected,
        )
        // A retained old pin must not attribute a subsequent change to its earlier author.
        f.sqlite
          .prepare('INSERT INTO featureRevision VALUES(?,?,?,?,?)')
          .run('next', 'feature', 'revision', 'change', content)
        expect(
          await locationHistoryReason(f.db as unknown as Database, {
            ...input,
            revisionId: 'next',
          }),
        ).toBe('Location updated')
        expect(
          await locationHistoryReason(f.db as unknown as Database, {
            ...input,
            reason: 'Custom reason',
          }),
        ).toBe('Custom reason')
      },
    )
  },
)
