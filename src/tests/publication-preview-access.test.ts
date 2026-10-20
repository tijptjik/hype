import { describe, expect, test } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { and } from 'drizzle-orm'
import * as schema from '../lib/db/schema'
import { toQueryConditions as projectConditions } from '../lib/api/services/project'
import { toQueryConditions as organisationConditions } from '../lib/api/services/organisation'
import { toQueryConditions as featureConditions } from '../lib/api/services/feature'
import {
  authorizeFeatureReadForProbe,
  authorizeFeatureUpdateForSubmission,
} from '../lib/api/services/authz/feature'
import { canPreviewPublication } from '../lib/publication/permissions'
import {
  publicationPreviewConditions,
  resolvePublicationPreview,
} from '../lib/api/services/publicationPreview'
import type { GuardedQueryContext } from '../lib/api/guarded.types'
import type { UserRoleDisco } from '../lib/types'

const user = { id: 'viewer', isAnonymous: false }
const target = { organisationId: 'org', projectId: 'project', hubId: 'hub' }
const role = (name: string, projectId = 'project'): UserRoleDisco =>
  ({ type: 'project', role: name, projectId }) as UserRoleDisco

describe('publication preview roles', () => {
  for (const name of ['user', 'member', 'translator', 'maintainer', 'owner']) {
    test(`${name} follows the preview role matrix`, () => {
      expect(canPreviewPublication(user, [role(name)], target)).toBe(
        ['maintainer', 'owner'].includes(name),
      )
    })
  }
  test('project roles do not grant upward or cross-project access', () => {
    expect(canPreviewPublication(user, [role('owner', 'other')], target)).toBe(false)
    expect(
      canPreviewPublication(user, [role('owner')], { ...target, projectId: null }),
    ).toBe(false)
  })
  test('organisation ownership is inherited but membership is not', () => {
    const owner = {
      type: 'organisation',
      role: 'owner',
      organisationId: 'org',
    } as UserRoleDisco
    expect(canPreviewPublication(user, [owner], target)).toBe(true)
    expect(
      canPreviewPublication(
        user,
        [{ ...owner, role: 'member' } as UserRoleDisco],
        target,
      ),
    ).toBe(false)
    expect(canPreviewPublication({ ...user, isAnonymous: true }, [owner], target)).toBe(
      false,
    )
  })
})

/** Creates minimal persisted ancestry and data for real SQL visibility assertions. */
function fixture() {
  const { sqlite, db } = publicationSqlite(schema)
  sqlite.exec(`
    CREATE TABLE organisation (id TEXT, code TEXT, hubId TEXT, isArchived INTEGER, isPublished INTEGER);
    CREATE TABLE project (id TEXT, code TEXT, organisationId TEXT, isArchived INTEGER, isPublished INTEGER, localIsPublished INTEGER);
    CREATE TABLE layer (id TEXT, organisationId TEXT, projectId TEXT, isArchived INTEGER, isPublished INTEGER, localIsPublished INTEGER);
    CREATE TABLE feature (id TEXT, organisationId TEXT, projectId TEXT, layerId TEXT, isArchived INTEGER, isPublished INTEGER, localIsPublished INTEGER, isDraft INTEGER);
    INSERT INTO organisation VALUES ('org','org-code','hub',0,1),('other-org','other-org-code','other-hub',0,1);
    INSERT INTO project VALUES ('project','project-code','org',0,0,NULL),('other','other-code','other-org',0,1,NULL);
    INSERT INTO layer VALUES ('layer','org','project',0,0,1),('draft-layer','org','project',0,0,0);
    INSERT INTO feature VALUES
      ('restored','org','project','layer',0,0,1,0),
      ('draft','org','project','layer',0,0,0,0),
      ('archived','org','project','layer',1,0,1,0),
      ('unsaved','org','project','layer',0,0,1,1),
      ('foreign','other-org','other','other-layer',0,0,1,0);
  `)
  const ctx = {
    db,
    user,
    userRoles: [role('maintainer')],
    event: { locals: { hub: { id: 'hub', isCore: false } } },
  } as unknown as GuardedQueryContext
  return { sqlite, db, ctx }
}

describe('publication preview server boundary', () => {
  test('both choices match descendant publication while excluding archived, unsaved and foreign rows', async () => {
    const { sqlite, db, ctx } = fixture()
    try {
      for (const publishChildren of [false, true]) {
        const { conditions } = await publicationPreviewConditions(
          ctx,
          { type: 'project', id: 'project', publishChildren },
          'feature',
          { isPublished: false, isArchived: true },
        )
        const rows = await db
          .select({ id: schema.feature.id })
          .from(schema.feature)
          .where(and(...conditions))
          .all()
        expect(rows.map(row => row.id).sort()).toEqual(
          publishChildren ? ['draft', 'restored'] : ['restored'],
        )
      }
      expect(
        sqlite.prepare('SELECT isPublished FROM project WHERE id = ?').get('project'),
      ).toEqual({ isPublished: 0 })
    } finally {
      sqlite.close()
    }
  })
  test('rejects forged targets, anonymous accounts, members, wrong hubs and revoked roles', async () => {
    const { sqlite, ctx } = fixture()
    const intent = { type: 'project' as const, id: 'project', publishChildren: true }
    try {
      await expect(
        resolvePublicationPreview(ctx, { ...intent, id: 'other' }),
      ).rejects.toMatchObject({ status: 403 })
      for (const roles of [[], [role('member')], [role('owner', 'other')]])
        await expect(
          resolvePublicationPreview({ ...ctx, userRoles: roles }, intent),
        ).rejects.toMatchObject({ status: 403 })
      await expect(
        resolvePublicationPreview(
          { ...ctx, user: { ...ctx.user, isAnonymous: true } },
          intent,
        ),
      ).rejects.toMatchObject({ status: 403 })
      await expect(
        resolvePublicationPreview(
          { ...ctx, event: { locals: { hub: { id: 'other-hub' } } } as never },
          intent,
        ),
      ).rejects.toMatchObject({ status: 403 })
    } finally {
      sqlite.close()
    }
  })
  for (const type of ['project', 'layer'] as const) {
    test(`${type} preview includes unpublished ancestors without siblings or writes`, async () => {
      const { sqlite, db, ctx } = fixture()
      try {
        sqlite.exec(`
          UPDATE organisation SET isPublished=0 WHERE id='org';
          INSERT INTO project VALUES ('sibling','sibling-code','org',0,0,1);
          INSERT INTO layer VALUES ('sibling-layer','org','sibling',0,0,1);
          INSERT INTO feature VALUES
            ('sibling-feature','org','sibling','sibling-layer',0,0,1,0),
            ('other-layer-feature','org','project','draft-layer',0,0,1,0);
        `)
        const before = sqlite.prepare('SELECT total_changes() AS changes').get()
        for (const publishChildren of [false, true]) {
          const preview = { type, id: type, publishChildren }
          for (const resource of [
            'organisation',
            'project',
            'layer',
            'feature',
          ] as const) {
            const { conditions } = await publicationPreviewConditions(
              ctx,
              preview,
              resource,
            )
            const table = schema[resource]
            const rows = await db
              .select({ id: table.id })
              .from(table)
              .where(and(...conditions))
              .all()
            const expected =
              resource === 'organisation'
                ? ['org']
                : resource === 'project'
                  ? ['project']
                  : resource === 'layer'
                    ? type === 'project' && publishChildren
                      ? ['draft-layer', 'layer']
                      : ['layer']
                    : [
                        ...(publishChildren ? ['draft'] : []),
                        ...(type === 'project' ? ['other-layer-feature'] : []),
                        'restored',
                      ]
            expect(rows.map(row => row.id).sort()).toEqual(expected.sort())
          }
        }
        expect(sqlite.prepare('SELECT total_changes() AS changes').get()).toEqual(
          before,
        )
      } finally {
        sqlite.close()
      }
    })
  }
  for (const ancestor of ['organisation', 'project']) {
    test(`archived ${ancestor} still blocks layer preview`, async () => {
      const { sqlite, ctx } = fixture()
      try {
        sqlite.exec(`UPDATE ${ancestor} SET isArchived=1`)
        await expect(
          resolvePublicationPreview(ctx, {
            type: 'layer',
            id: 'layer',
            publishChildren: true,
          }),
        ).rejects.toMatchObject({ status: 404 })
      } finally {
        sqlite.close()
      }
    })
  }
})

test('mixed role lists never promote membership or maintainer scope to archived access', async () => {
  const { sqlite, db, ctx } = fixture()
  try {
    sqlite.exec(
      "INSERT INTO project VALUES ('archived-project','archived-code','org',1,1,NULL)",
    )
    const roles = [
      role('owner', 'other'),
      role('member'),
      { type: 'organisation', organisationId: 'org', role: 'member' } as UserRoleDisco,
    ]
    const projects = projectConditions(ctx.db, ctx.user, true, {}, roles).conditions
    expect(
      await db
        .select({ id: schema.project.id })
        .from(schema.project)
        .where(and(...projects))
        .all(),
    ).toEqual([{ id: 'other' }])
    sqlite.exec("UPDATE organisation SET isPublished=0 WHERE id='org'")
    const organisations = organisationConditions(ctx.user, true, {}, roles).conditions
    expect(
      await db
        .select({ id: schema.organisation.id })
        .from(schema.organisation)
        .where(and(...organisations))
        .all(),
    ).toEqual([])
    const features = featureConditions(ctx.db, ctx.user, true, {}, [
      role('maintainer'),
    ]).conditions
    const ids = (
      await db
        .select({ id: schema.feature.id })
        .from(schema.feature)
        .where(and(...features))
        .all()
    ).map(row => row.id)
    expect(ids.sort()).toEqual(['draft', 'restored'])
  } finally {
    sqlite.close()
  }
})

test('maintainers cannot read or edit archived features, owners can', () => {
  const probe = {
    id: 'feature',
    organisationId: 'org',
    projectId: 'project',
    resourceHubId: 'hub',
    isPublished: false,
    isArchived: true,
  }
  for (const name of ['member', 'maintainer', 'owner']) {
    const params = { user, userRoles: [role(name)], probe }
    expect(authorizeFeatureReadForProbe(params).allowed).toBe(name === 'owner')
    expect(
      authorizeFeatureUpdateForSubmission({
        ...params,
        resource: probe,
        submittedData: { isVisitable: true },
      }).allowed,
    ).toBe(name === 'owner')
  }
})
