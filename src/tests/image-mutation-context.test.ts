// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it, vi } from 'vitest'
import {
  assertPermissionsToCreateImage,
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
          CREATE TABLE project (id TEXT, imageId TEXT, organisationId TEXT);
          CREATE TABLE feature (id TEXT, projectId TEXT);
          CREATE TABLE organisation (id TEXT, imageId TEXT, hubId TEXT);
          CREATE TABLE hub (id TEXT, imageId TEXT);
          CREATE TABLE task (id TEXT, projectId TEXT, organisationId TEXT, featureId TEXT);
          CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
          INSERT INTO image VALUES ('linked'), ('unrelated');
          INSERT INTO featureImage VALUES ('context', 'linked'), ('unrelated-feature', 'linked');
          INSERT INTO project VALUES ('context', 'linked', 'context'), ('project', null, 'context');
          INSERT INTO feature VALUES ('context', 'project');
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
          // A task's stored role scope cannot authorize an image on a foreign feature.
          sqlite.exec(`INSERT INTO organisation VALUES ('foreign-org', null, 'foreign-hub');
            INSERT INTO project VALUES ('foreign-project', null, 'foreign-org');
            UPDATE feature SET projectId = 'foreign-project' WHERE id = 'context';`)
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
          ).rejects.toMatchObject({ status: 403 })
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
          ).rejects.toMatchObject({ status: 403 })
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

describe('image creation context authorization', () => {
  const account = { id: 'account', isAnonymous: false } as never
  const adminRequest = new Request('https://example.test/admin/images')

  it('requires scoped hub authority and rejects unsupported contexts', async () => {
    const db = {} as Database
    await expect(
      assertPermissionsToCreateImage(
        db,
        account,
        adminRequest,
        [],
        'hub' as never,
        'hub',
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      assertPermissionsToCreateImage(
        db,
        account,
        adminRequest,
        [{ type: 'hub', role: 'admin', hubId: 'other' }] as never,
        'hub' as never,
        'hub',
      ),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      assertPermissionsToCreateImage(
        db,
        account,
        adminRequest,
        [{ type: 'hub', role: 'admin', hubId: 'hub' }] as never,
        'hub' as never,
        'hub',
      ),
    ).resolves.toBeUndefined()
    await expect(
      assertPermissionsToCreateImage(
        db,
        account,
        adminRequest,
        [],
        'user' as never,
        'account',
      ),
    ).rejects.toMatchObject({ status: 400 })
  })

  it.each(['valid', 'other-feature', 'reviewed', 'other-owner', 'wrong-context'])(
    'validates every draft link before granting contributor access (%s)',
    async scenario => {
      const draft = {
        featureId: 'feature',
        contributorId: 'account',
        isDraft: true,
        isReviewed: false,
      }
      const secondDraft = {
        ...draft,
        ...(scenario === 'other-feature' ? { featureId: 'other' } : {}),
        ...(scenario === 'reviewed' ? { isReviewed: true } : {}),
        ...(scenario === 'other-owner' ? { contributorId: 'other' } : {}),
      }
      const findFirst = vi
        .fn()
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(secondDraft)
      const db = { query: { task: { findFirst } } } as unknown as Database
      const result = assertPermissionsToCreateImage(
        db,
        account,
        new Request('https://example.test/'),
        [],
        (scenario === 'wrong-context' ? 'hub' : 'feature') as never,
        'feature',
        [
          { type: 'taskImage', taskId: 'first' },
          { type: 'taskImage', taskId: 'second' },
        ],
      )
      if (scenario === 'valid') {
        await expect(result).resolves.toBe('draft-contribution')
        expect(findFirst).toHaveBeenCalledTimes(2)
      } else {
        await expect(result).rejects.toMatchObject({
          status: scenario === 'other-owner' ? 401 : 403,
        })
      }
    },
  )
})
