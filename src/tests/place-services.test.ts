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
import { updateProjectByIdWithConcurrency } from '#lib/db/services/project.js'
import { createLocalPlace } from '#lib/db/services/placeLocal.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
import { ProjectPlacePolicyFormData } from '#lib/db/zod/schema/project.js'
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
    CREATE TABLE project(id TEXT PRIMARY KEY, modifiedAt TEXT DEFAULT 'original',
      organisationId TEXT, code TEXT, capabilities TEXT, markerStyleCode TEXT,
      cardStyleCode TEXT, useAllInOrgContext INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT, isDraft INTEGER DEFAULT 0);
    INSERT INTO project(id) VALUES ('p'), ('other');
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
  const batch = async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec('COMMIT')
      return results
    } catch (cause) {
      sqlite.exec('ROLLBACK')
      throw cause
    }
  }
  return {
    sqlite,
    db: drizzle({ prepare, batch } as unknown as D1Database) as Database,
  }
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

describe('local Place creation', () => {
  it.each(['manual', 'unresolved'] as const)(
    'creates a private %s identity with immutable provenance',
    async state => {
      const { sqlite, db } = setup()
      const created = await createLocalPlace(
        db,
        'p',
        { state, facts: { ...facts, phoneNumber: ['2345 6789', '91234567'] } },
        'author',
      )
      expect(
        sqlite
          .prepare('SELECT state,ownerProjectId,ssId FROM place WHERE id=?')
          .get(created.placeId),
      ).toEqual({ state, ownerProjectId: 'p', ssId: null })
      const revision = sqlite
        .prepare(
          'SELECT facts,payload,origin,contentHash FROM placeRevision WHERE id=?',
        )
        .get(created.revisionId)
      if (!revision) throw new Error('Missing local baseline')
      expect(JSON.parse(revision.facts as string).phoneNumber).toEqual([
        '+85223456789',
        '+85291234567',
      ])
      expect(JSON.parse(revision.payload as string).actorId).toBe('author')
      expect(revision.origin).toBe('local')
      expect(revision.contentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(
        sqlite.prepare('SELECT count(*) AS count FROM featurePlace').get()?.count,
      ).toBe(0)
    },
  )
  it('rolls back the identity if its baseline cannot be stored', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(
      "CREATE TRIGGER fail_baseline BEFORE INSERT ON placeRevision BEGIN SELECT RAISE(ABORT,'test failure'); END",
    )
    await expect(
      createLocalPlace(db, 'p', { state: 'manual', facts }, 'author'),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT count(*) AS count FROM place').get()?.count).toBe(0)
  })
  it('rejects invalid phones and unverified canonical addresses', () => {
    expect(
      LocalPlaceInputSchema.safeParse({
        state: 'manual',
        facts: { ...facts, phoneNumber: ['bad'] },
      }).success,
    ).toBe(false)
    expect(
      LocalPlaceInputSchema.safeParse({
        state: 'manual',
        facts: {
          ...facts,
          location: {
            ...facts.location,
            address: {
              ...facts.location.address,
              address2dId: 'claimed-source-address',
            },
          },
        },
      }).success,
    ).toBe(false)
  })
})

describe('Project form atomic Place settings', () => {
  const data = {
    organisationId: 'org',
    code: 'updated',
    capabilities: {
      manageBakeries: false,
      manageVolunteers: false,
      manageDropOffs: false,
    },
    markerStyleCode: null,
    cardStyleCode: 'full',
    useAllInOrgContext: false,
  } as Parameters<typeof updateProjectByIdWithConcurrency>[1]['data']

  it('saves core and first policy together, then rejects either stale revision', async () => {
    const { db, sqlite } = setup()
    const saved = await updateProjectByIdWithConcurrency(db, {
      id: 'p',
      updatedAt: 'original',
      data,
      placeUpdatePolicy: { policy: DEFAULT_PROJECT_PLACE_POLICY, expectedRevision: 0 },
    })
    expect(saved).not.toBeNull()
    if (!saved) throw new Error('Expected saved Project')
    expect((await getProjectPlaceSettings(db, 'p')).revision).toBe(1)
    for (const [updatedAt, expectedRevision] of [
      ['original', 1],
      [saved.modifiedAt, 0],
    ] as const) {
      expect(
        await updateProjectByIdWithConcurrency(db, {
          id: 'p',
          updatedAt,
          data: { ...data, code: 'must-not-save' },
          placeUpdatePolicy: { policy: DEFAULT_PROJECT_PLACE_POLICY, expectedRevision },
        }),
      ).toBeNull()
      expect(sqlite.prepare('SELECT code FROM project WHERE id=?').get('p')?.code).toBe(
        'updated',
      )
      expect((await getProjectPlaceSettings(db, 'p')).revision).toBe(1)
    }
    expect(
      await updateProjectByIdWithConcurrency(db, {
        id: 'p',
        updatedAt: saved.modifiedAt,
        data,
        placeUpdatePolicy: {
          policy: DEFAULT_PROJECT_PLACE_POLICY,
          expectedRevision: 1,
        },
      }),
    ).not.toBeNull()
    expect((await getProjectPlaceSettings(db, 'p')).revision).toBe(2)
  })

  it('rolls back core changes if the policy write fails', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      "CREATE TRIGGER fail_policy BEFORE INSERT ON projectPlacePolicy BEGIN SELECT RAISE(ABORT, 'policy failure'); END;",
    )
    await expect(
      updateProjectByIdWithConcurrency(db, {
        id: 'p',
        updatedAt: 'original',
        data,
        placeUpdatePolicy: {
          policy: DEFAULT_PROJECT_PLACE_POLICY,
          expectedRevision: 0,
        },
      }),
    ).rejects.toThrow()
    expect(
      sqlite.prepare('SELECT modifiedAt,code FROM project WHERE id=?').get('p'),
    ).toMatchObject({
      modifiedAt: 'original',
      code: null,
    })
    expect((await getProjectPlaceSettings(db, 'p')).revision).toBe(0)
  })
})

describe('Project Places form transport', () => {
  it('accepts serialized policy drafts and rejects incomplete or invalid settings', () => {
    const draft = { policy: DEFAULT_PROJECT_PLACE_POLICY, expectedRevision: 0 }
    expect(ProjectPlacePolicyFormData.parse(JSON.stringify(draft))).toEqual(draft)
    expect(ProjectPlacePolicyFormData.parse(undefined)).toBeUndefined()
    expect(ProjectPlacePolicyFormData.safeParse('{invalid').success).toBe(false)
    expect(
      ProjectPlacePolicyFormData.safeParse({
        ...draft,
        policy: { ...draft.policy, coordinates: { mode: 'withinDistance' } },
      }).success,
    ).toBe(false)
    expect(
      ProjectPlacePolicyFormData.safeParse({ ...draft, expectedRevision: -1 }).success,
    ).toBe(false)
  })
})
