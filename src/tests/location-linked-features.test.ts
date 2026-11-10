// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it } from 'vitest'
import { listLocationLinkedFeatures } from '#lib/db/services/locationFeatures.js'
import { authorizeFeatureAdminReadForProbe } from '#lib/api/services/authz/feature.js'
import type { Database, UserRoleDisco } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY, hubId TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT);
    CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,layerId TEXT,isPublished INTEGER,isArchived INTEGER,isDraft INTEGER);
    CREATE TABLE location(id TEXT PRIMARY KEY,kind TEXT,matchingType TEXT GENERATED ALWAYS AS (kind) VIRTUAL,state TEXT,ownerOrganisationId TEXT,redirectTargetId TEXT);
    CREATE VIEW locationCanonical AS SELECT id aliasId,id locationId FROM location;
    CREATE TABLE locationMembershipHead(id TEXT,relationshipId TEXT,childLocationId TEXT,parentLocationId TEXT,scopeOrganisationId TEXT,assertionState TEXT,membershipState TEXT);
    CREATE TABLE locationOccupancyHead(id TEXT,relationshipId TEXT,establishmentLocationId TEXT,containerLocationId TEXT,scopeOrganisationId TEXT,assertionState TEXT,occupancyState TEXT);
    CREATE TABLE featureLocation(featureId TEXT PRIMARY KEY,locationId TEXT);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
    CREATE TABLE projectI18n(projectId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    INSERT INTO organisation VALUES ('org1','hub1'),('org2','hub2');
    INSERT INTO project VALUES ('p1','org1'),('p2','org2');
    INSERT INTO projectI18n VALUES ('p1','en','Project One','One'),('p2','en','Project Two','Two');
    INSERT INTO layerI18n VALUES ('layer1','en','First Layer','Layer');`)
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      expect(args.length).toBeLessThanOrEqual(100)
      return prepare(query, args)
    },
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
  })
  const db = drizzle({ prepare } as unknown as D1Database) as unknown as Database
  function add(
    id: string,
    projectId = 'p1',
    locationId = 'location',
    published = 1,
    archived = 0,
    draft = 0,
  ): void {
    sqlite
      .prepare('INSERT INTO feature VALUES(?,?,?,?,?,?)')
      .run(id, projectId, 'layer1', published, archived, draft)
    sqlite.prepare('INSERT INTO featureLocation VALUES(?,?)').run(id, locationId)
    sqlite
      .prepare('INSERT INTO featureI18n VALUES(?,?,?)')
      .run(id, 'en', `Feature ${id}`)
  }
  return { db, sqlite, add }
}
const user = { id: 'viewer', isAnonymous: false, superAdmin: false }
const ownerRoles = [
  { type: 'project', role: 'owner', projectId: 'p1' },
] as UserRoleDisco[]

describe('Location reverse Feature lookup', () => {
  it('paginates only accessible current links across hidden internal pages, including drafts and archives', async () => {
    const { db, add } = setup()
    for (let i = 0; i < 90; i++) add(`a-hidden-${String(i).padStart(3, '0')}`, 'p2')
    for (let i = 0; i < 30; i++)
      add(
        `b-visible-${String(i).padStart(3, '0')}`,
        'p1',
        'location',
        i % 2,
        i % 3 === 0 ? 1 : 0,
        i % 2 === 0 ? 1 : 0,
      )
    add('not-linked-here', 'p1', 'another-location')
    const canRead = (
      probe: Parameters<typeof authorizeFeatureAdminReadForProbe>[0]['probe'],
    ): boolean =>
      authorizeFeatureAdminReadForProbe({ user, userRoles: ownerRoles, probe }).allowed
    const first = await listLocationLinkedFeatures(db, {
      locationId: 'location',
      locale: 'en',
      canRead,
    })
    expect(first.data).toHaveLength(25)
    expect(first.nextCursor).toBe('b-visible-024')
    expect(first.data.every(row => row.projectId === 'p1')).toBe(true)
    expect(first.data.some(row => row.isDraft)).toBe(true)
    expect(first.data.some(row => row.isArchived)).toBe(true)
    expect(first.data[0]).toMatchObject({ projectName: 'One', layerName: 'Layer' })
    expect(first.data[0]).not.toHaveProperty('organisationId')
    const second = await listLocationLinkedFeatures(db, {
      locationId: 'location',
      locale: 'en',
      after: first.nextCursor ?? undefined,
      canRead,
    })
    expect(second.data).toHaveLength(5)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.data, ...second.data].map(row => row.id)).size).toBe(30)
  })
  it('does not expose public-but-unmanageable Feature associations as admin links', async () => {
    const { db, add } = setup()
    add('public-other-project', 'p2')
    const result = await listLocationLinkedFeatures(db, {
      locationId: 'location',
      locale: 'en',
      canRead: probe =>
        authorizeFeatureAdminReadForProbe({ user, userRoles: ownerRoles, probe })
          .allowed,
    })
    expect(result).toEqual({ data: [], nextCursor: null })
  })
  it('uses persisted hub scope and locale fallback, and excludes removed links', async () => {
    const { db, sqlite, add } = setup()
    add('ours')
    add('other', 'p2')
    add('removed')
    sqlite.exec(
      "DELETE FROM featureLocation WHERE featureId='removed'; INSERT INTO featureI18n VALUES('ours','zhHant','功能名稱')",
    )
    const roles = [{ type: 'hub', role: 'admin', hubId: 'hub1' }] as UserRoleDisco[]
    const result = await listLocationLinkedFeatures(db, {
      locationId: 'location',
      locale: 'zhHant',
      canRead: probe =>
        authorizeFeatureAdminReadForProbe({ user, userRoles: roles, probe }).allowed,
    })
    expect(result.data.map(row => row.id)).toEqual(['ours'])
    expect(result.data[0]).toMatchObject({ title: '功能名稱', projectName: 'One' })
  })
})
