// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import {
  getAcceptedFeaturePlace,
  getProjectPlaceSettings,
  saveProjectPlaceSettings,
} from '#lib/db/services/place.js'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'
import { PlaceFactsSchema } from '#lib/places/validation.js'
import { authorizeProjectUpdateForSubmission } from '#lib/api/services/authz/index.js'
import type { Database, UserRoleDisco } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const db of stores.splice(0)) db.close()
})

function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE project(id TEXT PRIMARY KEY);
    CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT, isDraft INTEGER DEFAULT 0);
    INSERT INTO project VALUES ('p'), ('other');
    INSERT INTO feature(id,projectId) VALUES ('f','p');`)
  sqlite.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => prepare(query, args),
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
    all: async () => ({
      results: sqlite.prepare(query).all(...(values as never[])),
      success: true,
    }),
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.prepare(query).run(...(values as never[])).changes),
      },
    }),
  })
  return { sqlite, db: drizzle({ prepare } as unknown as D1Database) as Database }
}
const facts = {
  names: { en: 'Bakery' },
  phoneNumber: ['+85223456789', '+85291234567'],
  brands: [],
  location: {
    geometry: { type: 'Point', coordinates: [114.17, 22.3] },
    address: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      addressSnapshotId: null,
      records: {},
      fallbackDisplay: { en: 'Original address' },
    },
  },
}

describe('project Place settings persistence', () => {
  it('defaults to review and rejects stale initial and subsequent saves', async () => {
    const { db } = setup()
    expect(await getProjectPlaceSettings(db, 'p')).toEqual({
      policy: DEFAULT_PROJECT_PLACE_POLICY,
      revision: 0,
    })
    const automatic = {
      ...DEFAULT_PROJECT_PLACE_POLICY,
      coordinates: { mode: 'automatic' },
    }
    expect(await saveProjectPlaceSettings(db, 'p', automatic, 0)).toMatchObject({
      revision: 1,
    })
    expect(
      await saveProjectPlaceSettings(db, 'p', DEFAULT_PROJECT_PLACE_POLICY, 0),
    ).toBeNull()
    expect(
      await saveProjectPlaceSettings(db, 'p', DEFAULT_PROJECT_PLACE_POLICY, 1),
    ).toMatchObject({ revision: 2 })
    expect(await saveProjectPlaceSettings(db, 'p', automatic, 1)).toBeNull()
    expect(await getProjectPlaceSettings(db, 'other')).toMatchObject({ revision: 0 })
  })
  it.each([
    ['maintainer', 'p', false, true],
    ['owner', 'p', false, true],
    ['translator', 'p', false, false],
    ['member', 'p', false, false],
    ['maintainer', 'other', false, false],
    ['owner', 'p', true, false],
  ])('authorizes %s on %s anonymous=%s', (role, projectId, isAnonymous, allowed) => {
    const decision = authorizeProjectUpdateForSubmission({
      user: { id: 'u', isAnonymous: isAnonymous as boolean },
      userRoles: [{ type: 'project', role, projectId, userId: 'u' } as UserRoleDisco],
      resource: { id: 'p', organisationId: 'org', hubId: 'hub' },
      submittedData: { placeUpdatePolicy: true },
    })
    expect(decision.allowed).toBe(allowed)
  })
})

describe('accepted Place reads', () => {
  it('uses accepted revisions, preserves overrides, and prevents private cross-project reads', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(
      "INSERT INTO place(id,state,ownerProjectId) VALUES ('place','unresolved','p')",
    )
    for (const [id, sequence, value] of [
      ['old', 1, facts],
      [
        'new',
        2,
        {
          ...facts,
          names: { en: 'New bakery' },
          location: {
            ...facts.location,
            geometry: { type: 'Point', coordinates: [114.18, 22.3] },
          },
        },
      ],
    ] as const) {
      sqlite
        .prepare(
          "INSERT INTO placeRevision(id,placeId,sequence,origin,contentHash,payload,facts) VALUES (?,'place',?,'local','hash',?,?)",
        )
        .run(
          id,
          sequence,
          JSON.stringify({ privateEvidence: 'secret' }),
          JSON.stringify(value),
        )
    }
    sqlite
      .prepare('INSERT INTO featurePlace VALUES (?, ?, ?, ?, ?)')
      .run(
        'f',
        'place',
        'new',
        'old',
        JSON.stringify({ phoneNumber: { mode: 'clear' } }),
      )
    const result = await getAcceptedFeaturePlace(db, 'f', 'p')
    expect(result?.effective.names.en).toBe('New bakery')
    expect(result?.effective.location).toEqual(facts.location)
    expect(result?.effective.phoneNumber).toBeNull()
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(await getAcceptedFeaturePlace(db, 'f', 'other')).toBeNull()
    sqlite.exec("UPDATE place SET ownerProjectId='other'")
    expect(await getAcceptedFeaturePlace(db, 'f', 'p')).toBeNull()
    sqlite.exec("UPDATE place SET ownerProjectId='p'; UPDATE feature SET isDraft=1")
    expect(await getAcceptedFeaturePlace(db, 'f', 'p')).toBeNull()
  })
  it('rejects invalid geometry and unpinned resolved addresses', () => {
    expect(
      PlaceFactsSchema.safeParse({
        ...facts,
        location: {
          ...facts.location,
          geometry: { type: 'Point', coordinates: [181, 22] },
        },
      }).success,
    ).toBe(false)
    expect(
      PlaceFactsSchema.safeParse({
        ...facts,
        location: {
          ...facts.location,
          address: { ...facts.location.address, status: 'resolved', address2dId: 'a' },
        },
      }).success,
    ).toBe(false)
  })
})
