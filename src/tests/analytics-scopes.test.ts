// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  analyticsHostsForScope,
  listAnalyticsScopes,
  resolveAnalyticsResources,
} from '#lib/api/services/analyticsScope.js'
import { canAccessAnalytics, canSearchUsers } from '#lib/api/services/authz/user.js'
import { buildProductAnalyticsQuery } from '#lib/api/services/productAnalytics.js'
import { buildPlatformAnalyticsQuery } from '#lib/api/services/platformAnalytics.js'
import type { Database, UserRoleDisco } from '#lib/types.js'

const connections: Array<{ close(): void }> = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close()
})
function fixture(roles: unknown[], superAdmin = false) {
  const { sqlite, db } = publicationSqlite({}, 100)
  connections.push(sqlite)
  sqlite.exec(`
    CREATE TABLE hub(id TEXT,code TEXT);
    CREATE TABLE organisation(id TEXT,code TEXT,hubId TEXT,isCoreInclusive INTEGER DEFAULT 1,isHubExclusive INTEGER DEFAULT 0);
    CREATE TABLE project(id TEXT,code TEXT,organisationId TEXT);
    CREATE TABLE layer(id TEXT,projectId TEXT);
    CREATE TABLE feature(id TEXT,projectId TEXT);
    CREATE TABLE task(id TEXT,projectId TEXT);
    INSERT INTO hub VALUES('h','host'),('other','other');
    INSERT INTO organisation(id,code,hubId) VALUES('o','org','h'),('foreign','foreign','other');
    INSERT INTO project VALUES('p','project','o'),('sibling','sibling','o'),('foreign','foreign','foreign');
    INSERT INTO layer VALUES('l','p'),('other-layer','sibling');
    INSERT INTO feature VALUES('f','p'),('other-feature','sibling');
    INSERT INTO task VALUES('t','p'),('other-task','sibling');
  `)
  return {
    db: db as unknown as Database,
    user: { superAdmin },
    userRoles: roles as UserRoleDisco[],
  }
}
const member = {
  type: 'project',
  projectId: 'p',
  role: 'member',
  capabilities: { viewAnalytics: true },
}

describe('analytics authority and attribution', () => {
  it('delegates analytics without granting user search, siblings, parent or global access', async () => {
    const actor = fixture([member])
    expect(canAccessAnalytics({ ...actor.user, userRoles: actor.userRoles })).toBe(true)
    expect(canSearchUsers({ ...actor.user, userRoles: actor.userRoles })).toBe(false)
    expect(await listAnalyticsScopes(actor)).toEqual([
      { type: 'project', id: 'p', label: 'Project · project' },
    ])
    for (const selection of [
      { type: 'global' },
      { type: 'hub', id: 'h' },
      { type: 'organisation', id: 'o' },
      { type: 'project', id: 'sibling' },
    ] as const)
      expect(await resolveAnalyticsResources(actor, selection)).toBeNull()
    const scope = await resolveAnalyticsResources(actor, { type: 'project', id: 'p' })
    expect(scope?.entities).toEqual({
      organisations: [],
      projects: ['p'],
      layers: ['l'],
      features: ['f'],
      tasks: ['t'],
    })
    expect(scope?.paths).toEqual([
      '/project/project',
      '/project/project/',
      '/layer/l',
      '/layer/l/',
      '/features/f',
      '/features/f/',
    ])
  })

  it('grants organisation owners and delegated members their projects but not another organisation', async () => {
    for (const role of [{ role: 'owner' }, { role: 'member', viewAnalytics: true }]) {
      const actor = fixture([{ type: 'organisation', organisationId: 'o', ...role }])
      expect((await listAnalyticsScopes(actor)).map(row => row.id)).toEqual([
        'o',
        'p',
        'sibling',
      ])
      expect(
        (await resolveAnalyticsResources(actor, { type: 'organisation', id: 'o' }))
          ?.entities?.features,
      ).toEqual(['f', 'other-feature'])
      expect(
        await resolveAnalyticsResources(actor, { type: 'project', id: 'foreign' }),
      ).toBeNull()
    }
  })

  it('keeps owner access implicit and denies user-level or revoked delegation', async () => {
    expect(
      await listAnalyticsScopes(
        fixture([{ ...member, role: 'owner', capabilities: {} }]),
      ),
    ).toHaveLength(1)
    for (const role of [
      { ...member, role: 'user' },
      { ...member, capabilities: {} },
      { type: 'organisation', organisationId: 'o', role: 'user', viewAnalytics: true },
    ]) {
      const actor = fixture([role])
      expect(canAccessAnalytics({ userRoles: actor.userRoles })).toBe(false)
      expect(await listAnalyticsScopes(actor)).toEqual([])
    }
  })

  it('preserves global and hub perspectives without granting a foreign hub', async () => {
    const actor = fixture([
      { type: 'hub', hubId: 'h', role: 'admin', hub: { code: 'host' } },
    ])
    expect(
      (await resolveAnalyticsResources(actor, { type: 'hub', id: 'h' }))?.hubIds,
    ).toEqual(['h'])
    expect(
      await resolveAnalyticsResources(actor, { type: 'hub', id: 'other' }),
    ).toBeNull()
    expect(
      await resolveAnalyticsResources(fixture([], true), { type: 'global' }),
    ).toEqual({ label: 'Global' })
  })

  it('filters every traffic aggregate before ranking, including audience and timeline', () => {
    for (const facet of ['views', 'audience'] as const) {
      const query = buildPlatformAnalyticsQuery(
        {
          facet,
          hostname: 'hype.hk',
          hosts: ['hype.hk'],
          paths: ['/features/f'],
          now: new Date('2026-11-09'),
        },
        '30d',
      )
      expect(query.match(/requestPath_in:\["\/features\/f"\]/g)?.length).toBe(
        query.match(/rumPageloadEventsAdaptiveGroups/g)?.length,
      )
      expect(query).not.toContain('requestPath_like')
    }
  })

  it('filters usage totals and rankings by event and denies empty scopes or SQL injection', async () => {
    const scope = (await resolveAnalyticsResources(fixture([member]), {
      type: 'project',
      id: 'p',
    }))!
    for (const ranking of [true, false]) {
      const query = buildProductAnalyticsQuery(
        'hype_product_usage_production',
        ranking,
        scope,
      )
      expect(query).toContain("blob2 = 'project.filter' AND blob5 IN ('p')")
      expect(query).toContain(
        "blob2 IN ('feature.view','contribution.edit') AND blob5 IN ('f')",
      )
      expect(query).not.toContain('other-feature')
    }
    expect(
      buildProductAnalyticsQuery('hype_product_usage_production', false, {
        label: 'Empty',
        entities: {
          organisations: [],
          projects: [],
          layers: [],
          features: [],
          tasks: [],
        },
      }),
    ).toContain('AND 1 = 0')
    expect(() =>
      buildProductAnalyticsQuery('hype_product_usage_production', false, {
        label: 'Forged',
        hubIds: ["x' OR 1=1"],
      }),
    ).toThrow()
  })
})

const productionHubs = [
  { id: 'core', code: 'core', domain: 'hype.hk' },
  { id: 'h', code: 'ghostsigns', domain: 'hkghostsigns.com' },
  { id: 'other', code: 'breadline', domain: 'breadline.hk' },
  { id: 'preview', code: 'preview', domain: 'preview.hype.hk' },
]

it('limits organisation and project domains to their own hub and eligible core membership', async () => {
  const actor = fixture([{ type: 'organisation', organisationId: 'o', role: 'owner' }])
  for (const selection of [
    { type: 'organisation', id: 'o' },
    { type: 'project', id: 'p' },
  ] as const) {
    const scope = (await resolveAnalyticsResources(actor, selection))!
    expect(analyticsHostsForScope(productionHubs, scope)).toEqual([
      'hkghostsigns.com',
      'hype.hk',
    ])
    const query = buildProductAnalyticsQuery(
      'hype_product_usage_production',
      false,
      scope,
    )
    expect(query).toContain('blob5 IN')
    expect(query).not.toContain('blob4 IN')
  }
})

it('respects exclusive and core-excluded organisations without widening empty membership', () => {
  expect(
    analyticsHostsForScope(productionHubs, {
      label: 'Exclusive',
      trafficScope: { hubIds: ['h'], includeCore: false },
    }),
  ).toEqual(['hkghostsigns.com'])
  expect(
    analyticsHostsForScope(productionHubs, {
      label: 'Core only',
      trafficScope: { hubIds: [], includeCore: true },
    }),
  ).toEqual(['hype.hk'])
  expect(
    analyticsHostsForScope(productionHubs, {
      label: 'No membership',
      trafficScope: { hubIds: [], includeCore: false },
    }),
  ).toEqual([])
  expect(
    analyticsHostsForScope(productionHubs, { label: 'Hub', hubIds: ['other'] }),
  ).toEqual(['breadline.hk'])
  expect(analyticsHostsForScope(productionHubs, { label: 'Global' })).toEqual([
    'breadline.hk',
    'hkghostsigns.com',
    'hype.hk',
  ])
})

it('reads core inclusion flags from the project parent rather than inferring them from project access', async () => {
  const actor = fixture([member])
  const connection = connections.at(-1)! as ReturnType<
    typeof publicationSqlite
  >['sqlite']
  connection.exec("UPDATE organisation SET isHubExclusive=1 WHERE id='o'")
  expect(
    (await resolveAnalyticsResources(actor, { type: 'project', id: 'p' }))
      ?.trafficScope,
  ).toEqual({ hubIds: ['h'], includeCore: false })
  connection.exec(
    "UPDATE organisation SET isHubExclusive=0,isCoreInclusive=0 WHERE id='o'",
  )
  expect(
    (await resolveAnalyticsResources(actor, { type: 'project', id: 'p' }))
      ?.trafficScope,
  ).toEqual({ hubIds: ['h'], includeCore: false })
})
