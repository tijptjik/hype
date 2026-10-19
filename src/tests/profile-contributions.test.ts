// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '#lib/db/schema/index.js'
import { loadPrivateContributions } from '#lib/api/services/profileContributions.js'
import { getContributionStatus } from '#lib/contributions/profile.js'
import type { Database, SessionUser } from '#lib/types.js'

describe('personal contribution status', () => {
  it.each([
    [
      {
        isPublished: true,
        isArchived: false,
        review: { isReviewed: true, reviewOutcome: 'rejected' },
      },
      'published',
    ],
    [
      {
        isPublished: false,
        isArchived: false,
        review: { isReviewed: false, reviewOutcome: null },
      },
      'submitted',
    ],
    [
      {
        isPublished: false,
        isArchived: true,
        review: { isReviewed: true, reviewOutcome: 'rejected' },
      },
      'rejected',
    ],
    [
      {
        isPublished: false,
        isArchived: true,
        isRejectedByPartialReview: true,
        review: { isReviewed: true, reviewOutcome: 'accepted' },
      },
      'rejected',
    ],
    [
      {
        isPublished: false,
        isArchived: true,
        review: { isReviewed: true, reviewOutcome: 'accepted' },
      },
      'unpublished',
    ],
    [
      {
        isPublished: false,
        isArchived: false,
        review: { isReviewed: true, reviewOutcome: 'accepted' },
      },
      'unpublished',
    ],
    [{ isPublished: false, isArchived: false }, 'unpublished'],
  ] as const)('resolves persisted state %j', (state, expected) => {
    expect(getContributionStatus(state)).toBe(expected)
  })

  it('loads owner-only previews, including task-only images, while retaining map scope and excluding drafts', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      for (const name of [
        'feature',
        'featureI18n',
        'layer',
        'image',
        'featureImage',
        'task',
        'taskImage',
        'organisation',
        'project',
      ] as const) {
        const columns = Object.values(getTableColumns(schema[name]))
        sqlite.exec(
          `CREATE TABLE "${name}" (${columns.map(column => `"${column.name}" ${column.getSQLType()}`).join(',')})`,
        )
      }
      sqlite.exec(`INSERT INTO layer (id, isPublished, isArchived) VALUES ('layer',1,0),('hidden-layer',0,0);
        INSERT INTO organisation (id, hubId, isPublished, isArchived) VALUES ('org','hub',1,0),('other-org','other-hub',1,0);
        INSERT INTO project (id, organisationId, isPublished, isArchived) VALUES ('project','org',1,0);`)
      const addFeature = (
        id: string,
        owner = 'self',
        published = 0,
        archived = 0,
        draft = 0,
        org = 'org',
        layer = 'layer',
      ) => {
        sqlite
          .prepare(
            'INSERT INTO feature (id,contributorId,projectId,organisationId,layerId,isPublished,isArchived,isDraft,isPendingReview,createdAt) VALUES (?,?,?,?,?,?,?,?,0,?)',
          )
          .run(
            id,
            owner,
            'project',
            org,
            layer,
            published,
            archived,
            draft,
            '2026-01-01',
          )
        sqlite
          .prepare(
            "INSERT INTO featureI18n (featureId,locale,title,displayAddress) VALUES (?,'en',?,?)",
          )
          .run(id, id, 'Address')
      }
      addFeature('unpublished')
      addFeature('published', 'self', 1)
      addFeature('rejected', 'self', 0, 1)
      addFeature('submitted')
      addFeature('foreign', 'other')
      addFeature('draft', 'self', 0, 0, 1)
      addFeature('archived', 'self', 0, 1)
      addFeature('out-of-hub', 'self', 0, 0, 0, 'other-org')
      addFeature('hidden', 'self', 0, 0, 0, 'org', 'hidden-layer')
      const addTask = (
        id: string,
        featureId: string,
        type: string,
        reviewed: number,
        outcome: string | null,
        draft = 0,
        date = '2026-01-01',
      ) =>
        sqlite
          .prepare(
            "INSERT INTO task (id,featureId,projectId,organisationId,contributorId,type,isDraft,isReviewed,reviewOutcome,createdAt) VALUES (?,?,'project','org','self',?,?,?,?,?)",
          )
          .run(id, featureId, type, draft, reviewed, outcome, date)
      addTask('reject', 'rejected', 'newFeature', 1, 'rejected')
      addTask('submit', 'submitted', 'newFeature', 0, null)
      const addImage = (id: string, archived = 0) =>
        sqlite
          .prepare(
            "INSERT INTO image (id,contributorId,cdn,env,publicId,presentationMode,isArchived,createdAt,modifiedAt) VALUES (?,'self','cloudflareR2','production',?,'contain',?,'2026-01-01','2026-01-01')",
          )
          .run(id, id, archived)
      addImage('pending-photo')
      addImage('rejected-photo', 1)
      addImage('unpublished-photo')
      addImage('draft-photo')
      addImage('orphan-photo')
      addImage('private-parent-photo')
      addTask('photo-submit', 'published', 'newPhoto', 0, null)
      addTask('photo-reject', 'published', 'newPhoto', 1, 'rejected')
      addTask('photo-draft', 'published', 'newPhoto', 0, null, 1)
      sqlite.exec(
        `INSERT INTO taskImage VALUES ('photo-submit','pending-photo'),('photo-reject','rejected-photo'),('photo-draft','draft-photo'); INSERT INTO featureImage (featureId,imageId,isPublished) VALUES ('published','unpublished-photo',0),('foreign','private-parent-photo',0);`,
      )
      const db = drizzle(
        {
          prepare: (sql: string) => ({
            bind: (...params: unknown[]) => ({
              raw: async () => {
                const statement = sqlite.prepare(sql)
                statement.setReturnArrays(true)
                return statement.all(...(params as never[]))
              },
            }),
          }),
        } as never,
        { schema },
      ) as Database
      const params = {
        sessionUser: { id: 'self', locale: 'en', isAnonymous: false } as SessionUser,
        hubOpts: { isCore: false, organisations: [{ id: 'org' }] } as never,
      }
      const result = await loadPrivateContributions(db, params)
      expect(Object.keys(result.features).sort()).toEqual([
        'rejected',
        'submitted',
        'unpublished',
      ])
      expect(result.features.rejected.status).toBe('rejected')
      expect(result.features.submitted.status).toBe('submitted')
      expect(Object.keys(result.images).sort()).toEqual([
        'pending-photo',
        'private-parent-photo',
        'rejected-photo',
        'unpublished-photo',
      ])
      expect(result.images['pending-photo'].status).toBe('submitted')
      expect(result.images['rejected-photo'].status).toBe('rejected')
      expect(result.images['unpublished-photo'].status).toBe('unpublished')
      const filtered = await loadPrivateContributions(db, {
        ...params,
        prisms: { organisation: [], project: ['different'], layer: [] },
      })
      expect(filtered).toEqual({ features: {}, images: {} })
      const exclusive = await loadPrivateContributions(db, {
        ...params,
        hubOpts: {
          isCore: true,
          organisations: [{ id: 'org', isHubExclusive: true }],
        } as never,
      })
      expect(exclusive).toEqual({ features: {}, images: {} })
      expect(
        await loadPrivateContributions(db, {
          ...params,
          sessionUser: { ...params.sessionUser, isAnonymous: true },
        }),
      ).toEqual({ features: {}, images: {} })
    } finally {
      sqlite.close()
    }
  })
})
