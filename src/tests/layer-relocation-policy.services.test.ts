// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { getLayerRelocationSettings } from '#lib/db/services/layerLocationPolicy.js'
import { updateLayerByIdWithConcurrency } from '#lib/db/services/layer.js'
import {
  getProjectLocationSettings,
  saveProjectLocationSettings,
} from '#lib/db/services/location.js'
import { DEFAULT_PROJECT_LOCATION_POLICY } from '#lib/locations/model.js'
import { LayerRelocationPolicyFormData } from '#lib/db/zod/schema/layer.js'
import { authorizeLayerUpdateForSubmission } from '#lib/api/services/authz/index.js'
import type { Database, UserRoleDisco } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,locationPolicy TEXT,locationPolicyRevision INTEGER NOT NULL DEFAULT 0,modifiedAt TEXT);
    CREATE TABLE layer(id TEXT PRIMARY KEY,projectId TEXT REFERENCES project(id),organisationId TEXT,metadata TEXT,isDefaultVisible INTEGER NOT NULL DEFAULT 0,modifiedAt TEXT NOT NULL);
    CREATE TABLE retainedEvidence(id TEXT PRIMARY KEY,payload TEXT);
    INSERT INTO project VALUES('p','org',NULL,0,'original');
    INSERT INTO layer VALUES('l','p','org','{"keep":true}',0,'original');
    INSERT INTO retainedEvidence VALUES('history','{"condition":"retained"}');`)
  const retained = sqlite.prepare('SELECT * FROM retainedEvidence').all()
  sqlite.exec(readFileSync('migrations/0143_layer_relocation_policy.sql', 'utf8'))
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      if (args.length > 100) throw new Error('D1 parameter limit exceeded')
      return prepare(query, args)
    },
    first: async () => sqlite.prepare(query).get(...(values as never[])) ?? null,
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
  return {
    sqlite,
    retained,
    db: drizzle({ prepare } as unknown as D1Database) as unknown as Database,
  }
}

describe('Layer relocation settings and additive migration', () => {
  it('preserves rows/evidence and rejects invalid stored values', async () => {
    const { sqlite, db, retained } = setup()
    expect(await getLayerRelocationSettings(db, 'l')).toMatchObject({
      policy: null,
      revision: 0,
      projectPolicy: 'review',
      effectivePolicy: 'review',
    })
    expect(sqlite.prepare('SELECT * FROM retainedEvidence').all()).toEqual(retained)
    expect(sqlite.prepare('SELECT metadata FROM layer').get()?.metadata).toBe(
      '{"keep":true}',
    )
    expect(() =>
      sqlite.exec("UPDATE layer SET relocationPolicy='automatic' WHERE id='l'"),
    ).toThrow()
    expect(() =>
      sqlite.exec("UPDATE layer SET relocationPolicyRevision=-1 WHERE id='l'"),
    ).toThrow()
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check).toBe('ok')
  })
  it('reads and saves the initial v1/follow policy without implicit writes', async () => {
    const { sqlite, db } = setup()
    const initial = JSON.stringify({
      version: 1,
      coordinates: { mode: 'follow' },
      address: 'follow',
      unit: 'review',
      establishment: 'review',
    })
    sqlite.prepare("UPDATE project SET locationPolicy=? WHERE id='p'").run(initial)
    expect((await getProjectLocationSettings(db, 'p')).policy).toMatchObject({
      version: 1,
      address: 'follow',
      relocation: 'review',
    })
    expect(
      sqlite.prepare('SELECT locationPolicy FROM project').get()?.locationPolicy,
    ).toBe(initial)
    const saved = await saveProjectLocationSettings(
      db,
      'p',
      { ...DEFAULT_PROJECT_LOCATION_POLICY, relocation: 'follow' },
      0,
    )
    expect(saved?.revision).toBe(1)
    expect(saved?.policy.version).toBe(1)
    expect(await getLayerRelocationSettings(db, 'l')).toMatchObject({
      effectivePolicy: 'follow',
      projectRevision: 1,
    })
  })
  it('sets/clears overrides atomically and rejects stale policy heads without changing metadata', async () => {
    const { sqlite, db, retained } = setup()
    const data = { organisationId: 'org', projectId: 'p', metadata: { keep: true } }
    expect(
      await updateLayerByIdWithConcurrency(db, {
        id: 'l',
        updatedAt: 'original',
        data,
        relocationUpdatePolicy: { policy: 'fixed', expectedRevision: 0 },
      }),
    ).not.toBeNull()
    const modifiedAt = String(
      sqlite.prepare('SELECT modifiedAt FROM layer').get()?.modifiedAt,
    )
    expect(
      await updateLayerByIdWithConcurrency(db, {
        id: 'l',
        updatedAt: modifiedAt,
        data: { ...data, metadata: { keep: false } },
        relocationUpdatePolicy: { policy: 'follow', expectedRevision: 0 },
      }),
    ).toBeNull()
    expect(
      sqlite.prepare('SELECT metadata,relocationPolicyRevision FROM layer').get(),
    ).toMatchObject({ metadata: '{"keep":true}', relocationPolicyRevision: 1 })
    await saveProjectLocationSettings(
      db,
      'p',
      { ...DEFAULT_PROJECT_LOCATION_POLICY, relocation: 'follow' },
      0,
    )
    expect(await getLayerRelocationSettings(db, 'l')).toMatchObject({
      policy: 'fixed',
      effectivePolicy: 'fixed',
    })
    expect(
      await updateLayerByIdWithConcurrency(db, {
        id: 'l',
        updatedAt: modifiedAt,
        data,
        relocationUpdatePolicy: { policy: null, expectedRevision: 1 },
      }),
    ).not.toBeNull()
    expect(await getLayerRelocationSettings(db, 'l')).toMatchObject({
      policy: null,
      effectivePolicy: 'follow',
      revision: 2,
    })
    expect(sqlite.prepare('SELECT * FROM retainedEvidence').all()).toEqual(retained)
  })
  it('rolls back the complete core/policy update on storage failure and rejects malformed counters', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(
      "CREATE TRIGGER fail_policy BEFORE UPDATE OF relocationPolicy ON layer BEGIN SELECT RAISE(ABORT,'policy failure'); END;",
    )
    const input = {
      id: 'l',
      updatedAt: 'original',
      data: { organisationId: 'org', projectId: 'p', metadata: { changed: true } },
      relocationUpdatePolicy: { policy: 'fixed' as const, expectedRevision: 0 },
    }
    await expect(updateLayerByIdWithConcurrency(db, input)).rejects.toThrow()
    expect(
      sqlite
        .prepare('SELECT metadata,relocationPolicy,relocationPolicyRevision FROM layer')
        .get(),
    ).toMatchObject({
      metadata: '{"keep":true}',
      relocationPolicy: null,
      relocationPolicyRevision: 0,
    })
    for (const expectedRevision of [-1, 0.5, Number.MAX_SAFE_INTEGER]) {
      await expect(
        updateLayerByIdWithConcurrency(db, {
          ...input,
          relocationUpdatePolicy: { policy: 'fixed', expectedRevision },
        }),
      ).rejects.toThrow('Invalid policy revision')
    }
  })
  it('refuses invalid cross-Organisation parentage and validates the transport', async () => {
    const { sqlite, db } = setup()
    sqlite.exec("UPDATE layer SET organisationId='other' WHERE id='l'")
    expect(await getLayerRelocationSettings(db, 'l')).toBeNull()
    expect(
      LayerRelocationPolicyFormData.parse('{"policy":null,"expectedRevision":0}'),
    ).toEqual({ policy: null, expectedRevision: 0 })
    for (const input of [
      '{invalid',
      { policy: 'automatic', expectedRevision: 0 },
      { policy: 'fixed', expectedRevision: -1 },
    ])
      expect(LayerRelocationPolicyFormData.safeParse(input).success).toBe(false)
  })
  it('treats a policy-only submission as privileged, including when no other fields change', () => {
    const resource = { id: 'l', organisationId: 'org', projectId: 'p', hubId: 'hub' }
    const authorize = (roles: UserRoleDisco[]) =>
      authorizeLayerUpdateForSubmission({
        user: { id: 'u', isAnonymous: false },
        userRoles: roles,
        resource,
        submittedData: {
          relocationUpdatePolicy: { policy: 'follow', expectedRevision: 0 },
        },
      })
    for (const role of ['translator', 'maintainer', 'member'])
      expect(
        authorize([
          { type: 'project', role, projectId: 'p', userId: 'u' } as UserRoleDisco,
        ]).allowed,
      ).toBe(false)
    expect(
      authorize([
        {
          type: 'project',
          role: 'owner',
          projectId: 'p',
          userId: 'u',
        } as UserRoleDisco,
      ]).allowed,
    ).toBe(true)
    expect(
      authorize([
        {
          type: 'organisation',
          role: 'owner',
          organisationId: 'other',
          userId: 'u',
        } as UserRoleDisco,
      ]).allowed,
    ).toBe(false)
  })
})
