// @vitest-environment node
import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  feature,
  featureOrigin,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  task,
} from '#lib/db/schema/index.js'
import { FeatureInsert } from '#lib/db/zod/schema/feature.js'
import {
  createFeatureTask,
  saveFeatureTaskDraft,
} from '#lib/db/services/taskContribution.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

const tables = [
  feature,
  featureOrigin,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  task,
]

describe('atomic contribution draft updates', () => {
  it.each([
    'success',
    'task failure',
    'task skipped',
    'translation failure',
    'property failure',
    'task changed',
    'submitted',
    'reviewed',
    'contributor changed',
    'feature changed',
    'feature finalized',
    'linked',
    'destination moved',
  ])('saves both revisions or preserves concurrent state: %s', async scenario => {
    const { db: adapter, sqlite } = publicationSqlite({})
    const db = adapter as unknown as Database
    try {
      for (const table of tables)
        sqlite.exec(
          `CREATE TABLE "${getTableName(table)}" (${Object.values(
            getTableColumns(table),
          )
            .map(column => `"${column.name}" ${column.getSQLType()}`)
            .join(',')})`,
        )
      sqlite.exec(`CREATE TABLE property(id TEXT PRIMARY KEY,audience TEXT);
          CREATE TABLE organisation(id TEXT PRIMARY KEY);
          CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
          CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT);
          CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY);
          INSERT INTO organisation VALUES('org'),('other');
          INSERT INTO project VALUES('project','org'),('other','other');
          INSERT INTO layer VALUES('layer','project'),('destination','other');
          CREATE UNIQUE INDEX feature_id ON feature(id);
          CREATE UNIQUE INDEX task_id ON task(id);`)
      const created = await createFeatureTask(
        db,
        {
          data: FeatureInsert.parse({
            id: 'draft',
            organisationId: 'org',
            projectId: 'project',
            layerId: 'layer',
            contributorId: 'account',
            geometry: { type: 'Point', coordinates: [114, 22] },
            isDraft: true,
          }),
          i18n: { en: { title: 'Before' } },
          properties: [
            {
              propertyId: 'property',
              value: 'before',
              i18n: { en: { value: 'Before', valueGen: false } },
            },
          ],
        },
        { contributorId: 'account' },
      )
      if (scenario === 'task failure')
        sqlite.exec(
          "CREATE TRIGGER fail_task BEFORE UPDATE ON task BEGIN SELECT RAISE(ABORT,'task failed'); END",
        )
      if (scenario === 'task skipped')
        sqlite.exec(
          'CREATE TRIGGER skip_task BEFORE UPDATE ON task BEGIN SELECT RAISE(IGNORE); END',
        )
      if (scenario === 'translation failure')
        sqlite.exec(
          "CREATE TRIGGER fail_translation BEFORE UPDATE ON featureI18n BEGIN SELECT RAISE(ABORT,'translation failed'); END",
        )
      if (scenario === 'property failure')
        sqlite.exec(
          "CREATE TRIGGER fail_property BEFORE UPDATE ON featurePropertyI18n BEGIN SELECT RAISE(ABORT,'property failed'); END",
        )
      const mutations: Record<string, string> = {
        'task changed': "UPDATE task SET modifiedAt='concurrent'",
        submitted: 'UPDATE task SET isDraft=0',
        reviewed: 'UPDATE task SET isReviewed=1',
        'contributor changed': "UPDATE task SET contributorId='other-account'",
        'feature changed': "UPDATE feature SET modifiedAt='concurrent'",
        'feature finalized': 'UPDATE feature SET isDraft=0',
        linked: "INSERT INTO featureLocation VALUES('draft')",
        'destination moved':
          "UPDATE layer SET projectId='project' WHERE id='destination'",
      }
      const snapshot = () =>
        tables.map(table =>
          sqlite.prepare(`SELECT * FROM "${getTableName(table)}"`).all(),
        )
      let before = snapshot()
      const execute = db.batch.bind(db)
      const batch = vi.spyOn(db, 'batch').mockImplementation(async statements => {
        for (const statement of statements)
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        if (mutations[scenario]) sqlite.exec(mutations[scenario])
        before = snapshot()
        return execute(statements)
      })
      const saving = saveFeatureTaskDraft(
        db,
        {
          featureId: created.feature.id,
          projectId: created.feature.projectId,
          updatedAt: created.feature.modifiedAt,
          data: {
            projectId: 'other',
            organisationId: 'other',
            layerId: 'destination',
            geometry: { type: 'Point', coordinates: [115, 23] },
          },
          i18n: { en: { title: 'After' } },
          properties: [
            {
              propertyId: 'property',
              value: 'after',
              i18n: { en: { value: 'After', valueGen: false } },
            },
          ],
        },
        created.task,
      )
      if (scenario === 'success') {
        const result = await saving
        expect(result?.feature).toMatchObject({
          id: 'draft',
          projectId: 'other',
          organisationId: 'other',
          layerId: 'destination',
          isDraft: true,
        })
        expect(result?.task).toMatchObject({
          id: created.task.id,
          projectId: 'other',
          organisationId: 'other',
          contributorId: 'account',
          isDraft: true,
          isReviewed: false,
        })
        expect(result?.feature.modifiedAt).not.toBe(created.feature.modifiedAt)
        expect(result?.task.modifiedAt).not.toBe(created.task.modifiedAt)
        expect(sqlite.prepare('SELECT title FROM featureI18n').get()).toEqual({
          title: 'After',
        })
        expect(sqlite.prepare('SELECT value FROM featurePropertyI18n').get()).toEqual({
          value: 'After',
        })
      } else {
        if (scenario.endsWith('failure')) await expect(saving).rejects.toThrow(/failed/)
        else await expect(saving).resolves.toBeUndefined()
        expect(snapshot()).toEqual(before)
      }
      expect(batch).toHaveBeenCalledTimes(1)
    } finally {
      sqlite.close()
    }
  })
})
