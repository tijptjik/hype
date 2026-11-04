// @vitest-environment node
import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
  task,
} from '#lib/db/schema/index.js'
import { FeatureInsert } from '#lib/db/zod/schema/feature.js'
import { createFeatureTask } from '#lib/db/services/taskContribution.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

const tables = [feature, featureI18n, featureProperty, featurePropertyI18n, task]

describe('atomic contribution creation', () => {
  it.each([
    'draft',
    'final',
    'task failure',
    'translation failure',
    'property failure',
    'moved by trigger',
    'moved layer',
    'moved project',
  ])('commits a complete contribution or leaves no orphan: %s', async scenario => {
    const { db, sqlite } = publicationSqlite({})
    try {
      for (const table of tables) {
        sqlite.exec(
          `CREATE TABLE "${getTableName(table)}" (${Object.values(
            getTableColumns(table),
          )
            .map(column => `"${column.name}" ${column.getSQLType()}`)
            .join(',')})`,
        )
      }
      sqlite.exec(`CREATE TABLE property(id TEXT PRIMARY KEY,audience TEXT);
          CREATE TABLE organisation(id TEXT PRIMARY KEY);
          CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
          CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT);
          INSERT INTO organisation VALUES('org'),('other');
          INSERT INTO project VALUES('project','org'),('other','other');
          INSERT INTO layer VALUES('layer','project');
          CREATE UNIQUE INDEX feature_id ON feature(id);
          CREATE UNIQUE INDEX task_id ON task(id);`)
      if (scenario === 'task failure')
        sqlite.exec(
          "CREATE TRIGGER reject_task BEFORE INSERT ON task BEGIN SELECT RAISE(ABORT,'task failed'); END",
        )
      if (scenario === 'translation failure')
        sqlite.exec(
          "CREATE TRIGGER reject_translation BEFORE INSERT ON featureI18n BEGIN SELECT RAISE(ABORT,'translation failed'); END",
        )
      if (scenario === 'property failure')
        sqlite.exec(
          "CREATE TRIGGER reject_property BEFORE INSERT ON featurePropertyI18n BEGIN SELECT RAISE(ABORT,'property failed'); END",
        )
      if (scenario === 'moved by trigger')
        sqlite.exec(
          "CREATE TRIGGER move_parent AFTER INSERT ON feature BEGIN UPDATE project SET organisationId='other' WHERE id=NEW.projectId; END",
        )
      const input = {
        data: FeatureInsert.parse({
          id: 'new',
          organisationId: 'org',
          projectId: 'project',
          layerId: 'layer',
          contributorId: 'account',
          geometry: { type: 'Point', coordinates: [114, 22] },
          isDraft: scenario === 'draft',
        }),
        i18n: { en: { title: 'Contribution' } },
        properties: [
          {
            propertyId: 'prop',
            value: 'value',
            i18n: { en: { value: 'Translated value', valueGen: false } },
          },
        ],
      }
      const execute = db.batch.bind(db)
      const batch = vi.spyOn(db, 'batch').mockImplementation(async statements => {
        for (const statement of statements)
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        if (scenario === 'moved layer')
          sqlite.exec("UPDATE layer SET projectId='other'")
        if (scenario === 'moved project')
          sqlite.exec("UPDATE project SET organisationId='other' WHERE id='project'")
        return execute(statements)
      })
      const saving = createFeatureTask(db as unknown as Database, input, {
        contributorId: 'account',
        message: 'Submitted',
      })
      if (scenario === 'draft' || scenario === 'final') {
        const result = await saving
        expect(result.feature).toMatchObject({
          id: 'new',
          isDraft: scenario === 'draft',
        })
        expect(result.task).toMatchObject({
          featureId: 'new',
          projectId: 'project',
          organisationId: 'org',
          contributorId: 'account',
          isDraft: scenario === 'draft',
          isReviewed: false,
        })
        expect(sqlite.prepare('SELECT title FROM featureI18n').get()).toEqual({
          title: 'Contribution',
        })
        expect(sqlite.prepare('SELECT value FROM featurePropertyI18n').get()).toEqual({
          value: 'Translated value',
        })
      } else {
        if (scenario.startsWith('moved'))
          await expect(saving).rejects.toMatchObject({ status: 400 })
        else await expect(saving).rejects.toThrow(/failed/)
        for (const table of tables)
          expect(
            sqlite.prepare(`SELECT count(*) AS n FROM "${getTableName(table)}"`).get(),
          ).toEqual({ n: 0 })
      }
      if (scenario === 'moved by trigger')
        expect(
          sqlite.prepare("SELECT organisationId FROM project WHERE id='project'").get(),
        ).toEqual({ organisationId: 'org' })
      expect(batch).toHaveBeenCalledTimes(1)
    } finally {
      sqlite.close()
    }
  })
})
