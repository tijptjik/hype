// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import * as schema from '$lib/db/schema'
import { createTask, listTasks, loadTask, probeTaskQuery } from '$lib/db/services/task'
import type { Database } from '$lib/types'

vi.mock('$lib/db/services/hub', () => ({ getTaskHubFilter: () => undefined }))

describe('task feature scope integrity', () => {
  it('rejects spoofed task scope and isolates inconsistent persisted tasks', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`CREATE TABLE organisation (id TEXT PRIMARY KEY, hubId TEXT);
        CREATE TABLE project (id TEXT PRIMARY KEY, organisationId TEXT);
        CREATE TABLE feature (id TEXT PRIMARY KEY, projectId TEXT);
        CREATE TABLE task (
          id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT, featureId TEXT,
          contributorId TEXT, reviewerId TEXT, isDraft INTEGER DEFAULT 1,
          type TEXT, message TEXT, isReviewed INTEGER DEFAULT 0, reviewOutcome TEXT,
          reviewAction TEXT, reviewReason TEXT, createdAt TEXT DEFAULT '2026-01-01',
          modifiedAt TEXT DEFAULT '2026-01-01'
        );
        INSERT INTO organisation VALUES ('org', 'hub'), ('other-org', 'other-hub');
        INSERT INTO project VALUES ('project', 'org'), ('other-project', 'other-org');
        INSERT INTO feature VALUES ('feature', 'project'), ('other-feature', 'other-project');`)
      const db = drizzle(
        {
          prepare: (sql: string) => ({
            bind: (...params: unknown[]) => ({
              raw: async () => {
                const statement = sqlite.prepare(sql)
                statement.setReturnArrays(true)
                return statement.all(...(params as never[]))
              },
              all: async () => ({
                results: sqlite.prepare(sql).all(...(params as never[])),
              }),
            }),
          }),
        } as never,
        { schema },
      ) as Database
      const valid = {
        id: 'valid',
        featureId: 'feature',
        projectId: 'project',
        organisationId: 'org',
        contributorId: 'account',
        isDraft: true,
        isReviewed: false,
        type: 'reportedMissing' as const,
      }
      const opts = {
        i18n: { en: {}, zhHans: {}, zhHant: {} },
        isSuperAdmin: true,
        isAdminRequest: true,
        isCore: true,
      }
      const withFeature = { feature: { columns: { id: true, projectId: true } } }
      for (const patch of [
        { featureId: 'other-feature' },
        { projectId: 'other-project' },
        { organisationId: 'other-org' },
        { featureId: 'missing' },
      ]) {
        await expect(createTask(db, { ...valid, ...patch })).rejects.toMatchObject({
          status: 400,
        })
        expect(sqlite.prepare('SELECT count(*) AS count FROM task').get()).toEqual({
          count: 0,
        })
      }
      expect(await createTask(db, valid)).toMatchObject(valid)
      // Older or reparented rows must not route a foreign feature through a trusted task scope.
      sqlite.exec(`INSERT INTO task (id, featureId, projectId, organisationId)
        VALUES ('spoof-project', 'other-feature', 'project', 'org'),
          ('spoof-org', 'feature', 'project', 'other-org'),
          ('missing', 'deleted-feature', 'project', 'org');`)
      for (const id of ['spoof-project', 'spoof-org', 'missing']) {
        expect(await probeTaskQuery(db, { ref: id })).toBeNull()
        expect(
          await loadTask(db, withFeature, [eq(schema.task.id, id)], opts),
        ).toBeUndefined()
      }
      expect(await probeTaskQuery(db, { ref: 'valid' })).toMatchObject({
        projectId: 'project',
        organisationId: 'org',
      })
      expect(
        await loadTask(db, withFeature, [eq(schema.task.id, 'valid')], opts),
      ).toMatchObject({
        ...valid,
        feature: { id: 'feature', projectId: 'project' },
      })
      const listed = await listTasks(db, withFeature, [], opts)
      expect(listed.data.map(row => row.id)).toEqual(['valid'])
      expect(listed.totalCount).toBe(1)
    } finally {
      sqlite.close()
    }
  })
})
