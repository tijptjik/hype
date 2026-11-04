// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  commitTaskDraftFinalization,
  commitTaskFeatureDraftFinalization,
} from '#lib/db/services/task.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import { task } from '#lib/db/schema/task.js'
import { getTableColumns } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

it.each(['newFeature', 'newPhoto', 'reportedMissing'] as const)(
  'guards %s finalization against changed state and evidence',
  async type => {
    for (const change of [
      'success',
      'task version',
      'contributor',
      'reviewed',
      'submitted',
      'scope',
      'image removed',
      'image archived',
      'image deleted',
      ...(type === 'newFeature'
        ? ['feature version', 'feature finalized', 'feature failure', 'feature skipped']
        : []),
    ]) {
      const { db: adapter, sqlite } = publicationSqlite({})
      const db = adapter as unknown as Database
      try {
        sqlite.exec(`CREATE TABLE task (${Object.values(getTableColumns(task))
          .map(column => `"${column.name}" ${column.getSQLType()}`)
          .join(',')});
        CREATE TABLE feature(id TEXT,projectId TEXT,isDraft INTEGER,modifiedAt TEXT);
        CREATE TABLE project(id TEXT,organisationId TEXT);
        CREATE TABLE organisation(id TEXT);
        CREATE TABLE image(id TEXT,isArchived INTEGER);
        CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
        INSERT INTO organisation VALUES('org');
        INSERT INTO project VALUES('project','org');
        INSERT INTO feature VALUES('feature','project',1,'feature-v1');
        INSERT INTO image VALUES('image',0);
        INSERT INTO taskImage VALUES('task','image');`)
        sqlite
          .prepare(
            'INSERT INTO task(id,featureId,projectId,organisationId,contributorId,type,isDraft,isReviewed,modifiedAt) VALUES(?,?,?,?,?,?,1,0,?)',
          )
          .run('task', 'feature', 'project', 'org', 'account', type, 'task-v1')
        const expected = {
          id: 'task',
          featureId: 'feature',
          contributorId: 'account',
          modifiedAt: 'task-v1',
          type,
        }
        const changes: Record<string, string> = {
          'task version': "UPDATE task SET modifiedAt='task-v2'",
          contributor: "UPDATE task SET contributorId='other'",
          reviewed: 'UPDATE task SET isReviewed=1',
          submitted: 'UPDATE task SET isDraft=0',
          scope: "UPDATE feature SET projectId='other'",
          'image removed': 'DELETE FROM taskImage',
          'image archived': 'UPDATE image SET isArchived=1',
          'image deleted': 'DELETE FROM image',
          'feature version': "UPDATE feature SET modifiedAt='feature-v2'",
          'feature finalized': 'UPDATE feature SET isDraft=0',
          'feature failure':
            "CREATE TRIGGER fail BEFORE UPDATE ON feature BEGIN SELECT RAISE(ABORT,'feature failed'); END",
          'feature skipped':
            'CREATE TRIGGER skip BEFORE UPDATE ON feature BEGIN SELECT RAISE(IGNORE); END',
        }
        if (changes[change]) sqlite.exec(changes[change])
        const snapshot = () => [
          sqlite.prepare('SELECT * FROM task').all(),
          sqlite.prepare('SELECT * FROM feature').all(),
        ]
        const before = snapshot()
        const result =
          type === 'newFeature'
            ? commitTaskFeatureDraftFinalization(db, {
                task: expected,
                feature: { id: 'feature', modifiedAt: 'feature-v1' },
              })
            : commitTaskDraftFinalization(db, expected)
        if (change === 'feature failure')
          await expect(result).rejects.toThrow('feature failed')
        else if (change === 'success') {
          expect(await result).toBeTruthy()
          expect(sqlite.prepare('SELECT isDraft FROM task').get()).toEqual({
            isDraft: 0,
          })
          if (type === 'newFeature')
            expect(sqlite.prepare('SELECT isDraft FROM feature').get()).toEqual({
              isDraft: 0,
            })
        } else expect(await result).toBeFalsy()
        if (change !== 'success')
          expect(snapshot(), `${type}: ${change}`).toEqual(before)
      } finally {
        sqlite.close()
      }
    }
  },
)
