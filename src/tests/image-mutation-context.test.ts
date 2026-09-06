// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it, vi } from 'vitest'
import {
  assertPermissionsToDeleteImage,
  assertPermissionsToUpdateImage,
} from '$lib/api/services/image'
import type { Database } from '$lib/types'

vi.mock('$lib/db/services/project', () => ({
  getProjectForFeatureId: vi.fn(async () => ({ id: 'project' })),
}))

describe('image mutation resource membership', () => {
  it.each(['feature', 'project', 'organisation', 'hub', 'task'])(
    'requires the image to belong to the authorized %s',
    async ctxType => {
      const sqlite = new DatabaseSync(':memory:')
      try {
        sqlite.exec(`CREATE TABLE image (id TEXT);
          CREATE TABLE featureImage (featureId TEXT, imageId TEXT);
          CREATE TABLE project (id TEXT, imageId TEXT);
          CREATE TABLE organisation (id TEXT, imageId TEXT, hubId TEXT);
          CREATE TABLE hub (id TEXT, imageId TEXT);
          CREATE TABLE task (id TEXT, projectId TEXT, organisationId TEXT, featureId TEXT);
          CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
          INSERT INTO image VALUES ('linked'), ('unrelated');
          INSERT INTO featureImage VALUES ('context', 'linked'), ('unrelated-feature', 'linked');
          INSERT INTO project VALUES ('context', 'linked');
          INSERT INTO organisation VALUES ('context', 'linked', 'context');
          INSERT INTO hub VALUES ('context', 'linked');
          INSERT INTO task VALUES ('context', 'project', 'context', 'context');
          INSERT INTO taskImage VALUES ('context', 'linked');`)
        const db = drizzle({
          prepare: (sql: string) => ({
            bind: (...params: unknown[]) => ({
              raw: async () =>
                sqlite
                  .prepare(sql)
                  .all(...(params as never[]))
                  .map(row => Object.values(row)),
            }),
          }),
        } as never) as Database
        const roles = [
          {
            type: 'project',
            role: 'maintainer',
            projectId: ctxType === 'project' ? 'context' : 'project',
          },
          { type: 'organisation', role: 'owner', organisationId: 'context' },
          { type: 'hub', role: 'admin', hubId: 'context' },
        ] as never
        const user = { id: 'account', isAnonymous: false, superAdmin: false } as never
        const request = new Request('https://example.test/admin/images')
        if (ctxType === 'feature' || ctxType === 'project') {
          await expect(
            assertPermissionsToDeleteImage(
              db,
              user,
              request,
              [{ type: 'project', role: 'owner', projectId: 'other-project' }] as never,
              'linked',
              'context',
              ctxType as never,
            ),
          ).rejects.toMatchObject({ status: 403 })
          await expect(
            assertPermissionsToDeleteImage(
              db,
              user,
              request,
              [
                {
                  type: 'project',
                  role: 'owner',
                  projectId: ctxType === 'project' ? 'context' : 'project',
                },
              ] as never,
              'linked',
              'context',
              ctxType as never,
            ),
          ).resolves.toBeUndefined()
        }
        await expect(
          assertPermissionsToUpdateImage(
            db,
            user,
            request,
            { id: 'linked', featureId: 'unrelated-feature' } as never,
            roles,
            'linked',
            'context',
            ctxType as never,
          ),
        ).rejects.toMatchObject({
          status: 403,
          body: { message: 'IMAGE_FEATURE_CONTEXT_MISMATCH' },
        })
        if (ctxType === 'feature' || ctxType === 'task') {
          await expect(
            assertPermissionsToUpdateImage(
              db,
              user,
              request,
              { id: 'linked', featureId: 'context' } as never,
              roles,
              'linked',
              'context',
              ctxType as never,
            ),
          ).resolves.toBeUndefined()
        }
        await expect(
          assertPermissionsToDeleteImage(
            db,
            user,
            request,
            roles,
            'linked',
            'context',
            ctxType as never,
          ),
        ).resolves.toBeUndefined()
        await expect(
          assertPermissionsToDeleteImage(
            db,
            user,
            request,
            roles,
            'unrelated',
            'context',
            ctxType as never,
          ),
        ).rejects.toMatchObject({
          status: 403,
          body: { message: 'IMAGE_CONTEXT_MISMATCH' },
        })
        if (ctxType === 'hub' || ctxType === 'task') {
          await expect(
            assertPermissionsToDeleteImage(
              db,
              user,
              request,
              [],
              'linked',
              'context',
              ctxType as never,
            ),
          ).rejects.toMatchObject({ status: 403 })
        }
        if (ctxType === 'task') {
          for (const role of [
            { type: 'organisation', role: 'owner', organisationId: 'context' },
            { type: 'hub', role: 'admin', hubId: 'context' },
            { type: 'project', role: 'owner', projectId: 'project' },
          ]) {
            await expect(
              assertPermissionsToDeleteImage(
                db,
                user,
                request,
                [role] as never,
                'linked',
                'context',
                ctxType as never,
              ),
            ).resolves.toBeUndefined()
          }
        }
      } finally {
        sqlite.close()
      }
    },
  )
  it('rejects unsupported contexts instead of skipping role checks', async () => {
    await expect(
      assertPermissionsToDeleteImage(
        {} as never,
        { id: 'account' } as never,
        new Request('https://example.test/admin/images'),
        [],
        'image',
        'context',
        'user' as never,
      ),
    ).rejects.toMatchObject({ status: 400 })
  })
})
