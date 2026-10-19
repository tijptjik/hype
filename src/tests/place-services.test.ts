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
import { persistSaanSeoiPlace } from '#lib/db/services/placeSource.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'
import { prepareFeaturePlaceAssociationWrite } from '#lib/db/services/placeAssociation.js'
import { prepareFeaturePlaceRelations } from '#lib/db/services/placeRelations.js'
import {
  createFeatureForm,
  saveUnlinkedFeatureForm,
} from '#lib/db/services/featureFormSave.js'
import { saveLinkedFeatureForm } from '#lib/db/services/placeEdit.js'
import { readFeaturePlaceBaseline } from '#lib/db/services/placeBaseline.js'
import { linkInitialFeaturePlace } from '#lib/db/services/placeLink.js'
import { createLocalPlace } from '#lib/db/services/placeLocal.js'
import { LocalPlaceInputSchema } from '#lib/places/local.js'
import { ProjectPlacePolicyFormData } from '#lib/db/zod/schema/project.js'
import { DEFAULT_PROJECT_PLACE_POLICY } from '#lib/places/model.js'
import { PlaceFactsSchema } from '#lib/places/validation.js'
import {
  authorizeFeatureUpdateForSubmission,
  authorizeProjectUpdateForSubmission,
} from '#lib/api/services/authz/index.js'
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
    CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT, isDraft INTEGER DEFAULT 0, modifiedAt TEXT DEFAULT 'original', geometry TEXT, addressMeta TEXT, isIntangible INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,displayAddress TEXT);
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT,scope TEXT,hubId TEXT);
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT);
    CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT);
    CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT);
    INSERT INTO project(id) VALUES ('p'), ('other');
    INSERT INTO feature(id,projectId) VALUES ('f','p');`)
  sqlite.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0110_feature_place_history.sql', 'utf8'))
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      if (args.length > 100) throw new Error('D1 parameter limit exceeded')
      return prepare(query, args)
    },
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
      .prepare(
        'INSERT INTO featurePlace(featureId,placeId,factsRevisionId,locationRevisionId,overrides) VALUES (?, ?, ?, ?, ?)',
      )
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

describe('immutable SaanSeoi Place ingestion', () => {
  const projection = (): SaanSeoiPlaceProjection => ({
    ssId: 'canonical-shop',
    apiVersion: 'api-places-v0.1',
    releaseId: 'release',
    snapshotId: 'snapshot',
    facts: PlaceFactsSchema.parse(facts),
    issues: [],
    payload: {
      resource: { id: 'canonical-shop', sources: ['retained-attribution'] },
      meta: { apiReleaseSet: 'pinned-release' },
    },
  })

  it('replays idempotently and appends changes without altering accepted Features', async () => {
    const { db, sqlite } = setup()
    const source = projection()
    const first = await persistSaanSeoiPlace(db, source)
    const replay = await persistSaanSeoiPlace(db, {
      ...source,
      payload: { meta: source.payload.meta, resource: source.payload.resource },
    })
    expect(replay).toEqual(first)
    source.facts.names.en = 'Updated bakery'
    const next = await persistSaanSeoiPlace(db, source)
    expect(next.placeId).toBe(first.placeId)
    expect(next.revisionId).not.toBe(first.revisionId)
    expect(
      sqlite.prepare('SELECT sequence FROM placeRevision ORDER BY sequence').all(),
    ).toEqual([{ sequence: 1 }, { sequence: 2 }])
    const original = sqlite
      .prepare('SELECT facts,payload FROM placeRevision WHERE id=?')
      .get(first.revisionId)
    expect(JSON.parse(String(original?.facts)).names.en).toBe('Bakery')
    expect(JSON.parse(String(original?.payload)).resource.sources).toEqual([
      'retained-attribution',
    ])
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featurePlace').get()?.count,
    ).toBe(0)
  })

  it('retains an existing HYPE identity and rolls back failed new ingestion', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      "INSERT INTO place(id,ssId,state) VALUES ('permanent-id','canonical-shop','linked')",
    )
    expect((await persistSaanSeoiPlace(db, projection())).placeId).toBe('permanent-id')
    sqlite.exec(
      "CREATE TRIGGER fail_source BEFORE INSERT ON placeRevision BEGIN SELECT RAISE(ABORT,'failed'); END",
    )
    await expect(
      persistSaanSeoiPlace(db, { ...projection(), ssId: 'other-shop' }),
    ).rejects.toThrow()
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM place WHERE ssId='other-shop'")
        .get()?.count,
    ).toBe(0)
  })
})

describe('conditional association writes and immutable history', () => {
  it('gates effective writes on the winning token and leaves stale batches unchanged', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(readFileSync('migrations/0109_place_association_scope.sql', 'utf8'))
    const local = await createLocalPlace(db, 'p', { state: 'manual', facts }, 'actor')
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      placeId: local.placeId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const { feature } = await import('#lib/db/schema/feature.js')
    const { sql } = await import('drizzle-orm')
    const winner = prepareFeaturePlaceAssociationWrite(db, input)
    const stale = prepareFeaturePlaceAssociationWrite(db, input)
    const materialize = (revision: string, modifiedAt: string) =>
      db
        .update(feature)
        .set({ modifiedAt })
        .where(sql`id = 'f' AND EXISTS
        (SELECT 1 FROM featurePlace WHERE featureId = 'f' AND revision = ${revision})`)
        .returning({ id: feature.id })
    const accepted = await db.batch([
      winner.query,
      materialize(winner.revision, 'accepted'),
    ])
    expect(accepted[0]).toEqual([{ revision: winner.revision }])
    expect(accepted[1]).toEqual([{ id: 'f' }])
    expect(await db.batch([stale.query, materialize(stale.revision, 'stale')])).toEqual(
      [[], []],
    )
    expect(sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get()).toEqual(
      { modifiedAt: 'accepted' },
    )
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featurePlaceHistory').get(),
    ).toEqual({ n: 1 })
  })

  it('rejects stale saves, retains immutable snapshots and prevents token reuse after unlink', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalPlace(db, 'p', { state: 'manual', facts }, 'actor')
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      placeId: local.placeId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const [initial] = await db.batch([
      prepareFeaturePlaceAssociationWrite(db, input).query,
    ])
    expect(initial).toHaveLength(1)
    expect(await prepareFeaturePlaceAssociationWrite(db, input).query).toEqual([])
    const edit = {
      ...input,
      expectedRevision: initial[0].revision,
      overrides: { phoneNumber: { mode: 'clear' as const } },
    }
    const updated = await prepareFeaturePlaceAssociationWrite(db, edit).query
    expect(updated).toHaveLength(1)
    expect(await prepareFeaturePlaceAssociationWrite(db, edit).query).toEqual([])
    sqlite.exec("UPDATE feature SET modifiedAt='later' WHERE id='f'")
    expect(
      await prepareFeaturePlaceAssociationWrite(db, {
        ...edit,
        expectedRevision: updated[0].revision,
      }).query,
    ).toEqual([])
    const history = sqlite
      .prepare(
        'SELECT action, previousRevision, overrides, actorId FROM featurePlaceHistory ORDER BY id',
      )
      .all()
    expect(history).toEqual([
      { action: 'link', previousRevision: null, overrides: '{}', actorId: 'actor' },
      {
        action: 'update',
        previousRevision: initial[0].revision,
        overrides: '{"phoneNumber":{"mode":"clear"}}',
        actorId: 'actor',
      },
    ])
    expect(() =>
      sqlite.exec("UPDATE featurePlace SET overrides='{}' WHERE featureId='f'"),
    ).toThrow('new revision')
    expect(() => sqlite.exec('DELETE FROM featurePlaceHistory')).toThrow('immutable')
    expect(() =>
      sqlite.exec("UPDATE featurePlaceHistory SET actorId='someone'"),
    ).toThrow('immutable')
    sqlite.exec("DELETE FROM featurePlace WHERE featureId='f'")
    expect(
      sqlite
        .prepare(
          'SELECT action,actorId FROM featurePlaceHistory ORDER BY id DESC LIMIT 1',
        )
        .get(),
    ).toEqual({ action: 'unlink', actorId: null })
    expect(() =>
      sqlite
        .prepare(`INSERT INTO featurePlace(featureId,placeId,factsRevisionId,locationRevisionId,revision)
      VALUES ('f',?,?,?,?)`)
        .run(local.placeId, local.revisionId, local.revisionId, initial[0].revision),
    ).toThrow()
    expect(sqlite.prepare('SELECT count(*) AS n FROM featurePlace').get()).toEqual({
      n: 0,
    })
    expect(
      await prepareFeaturePlaceAssociationWrite(db, {
        ...input,
        expectedFeatureModifiedAt: 'later',
      }).query,
    ).toHaveLength(1)
    sqlite.exec("DELETE FROM feature WHERE id='f'")
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featurePlaceHistory').get(),
    ).toEqual({ n: 5 })
  })

  it('rolls back association and history if the surrounding materialization batch fails', async () => {
    const { db, sqlite } = setup()
    const local = await createLocalPlace(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      placeId: local.placeId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const { featurePlace } = await import('#lib/db/schema/place.js')
    await expect(
      db.batch([
        prepareFeaturePlaceAssociationWrite(db, input).query,
        db.insert(featurePlace).values({
          featureId: 'f',
          placeId: local.placeId,
          factsRevisionId: local.revisionId,
          locationRevisionId: local.revisionId,
        }),
      ]),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT count(*) AS n FROM featurePlace').get()).toEqual({
      n: 0,
    })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featurePlaceHistory').get(),
    ).toEqual({ n: 0 })
  })
})

describe('persisted Feature baseline and initial linking', () => {
  it('retains structured address corrections and ordered phone arrays', async () => {
    const { db, sqlite } = setup()
    const { emptyFeatureAddress } = await import('#lib/addresses/featureAddress.js')
    const address = emptyFeatureAddress({ en: 'Old address' })
    address.overrides.en = {
      formattedAddress: 'Corrected address',
      premisesName: 'Collection room',
    }
    sqlite
      .prepare("UPDATE feature SET geometry=?, addressMeta=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry), JSON.stringify({ address }))
    sqlite.exec(`INSERT INTO featureI18n VALUES ('f','en','Bakery','Old address');
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO featureProperty VALUES ('f','phone',NULL,'["9123 4567","2345 6789"]');`)
    const result = await readFeaturePlaceBaseline(db, 'f', 'p')
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error('Expected ready baseline')
    expect(result.baseline.address).toEqual(address)
    expect(result.baseline.effective.location?.address.fallbackDisplay.en).toBe(
      'Corrected address',
    )
    expect(result.baseline.effective.phoneNumber).toEqual(['9123 4567', '2345 6789'])
  })

  it('preserves names, universal phone, brand identities and existing columns when linking', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(readFileSync('migrations/0109_place_association_scope.sql', 'utf8'))
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec(`INSERT INTO featureI18n VALUES ('f','en','Collection counter','Original address'), ('f','zh-hant','麵包店',NULL);
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property VALUES ('phone','phoneNumber','hub','core'),('brand','brand','organisation',NULL);
      INSERT INTO featureProperty VALUES ('f','phone',NULL,'2345 6789'),('f','brand','legacy-brand',NULL);
      INSERT INTO propertyValue VALUES ('legacy-brand','brand');
      INSERT INTO propertyValueI18n VALUES ('legacy-brand','en','Bakery brand'),('legacy-brand','zh-hant','品牌');`)
    const baseline = await readFeaturePlaceBaseline(db, 'f', 'p')
    expect(baseline.status).toBe('ready')
    if (baseline.status !== 'ready') throw new Error('Expected persisted baseline')
    expect(baseline.baseline.effective).toMatchObject({
      names: { en: 'Collection counter', 'zh-hant': '麵包店' },
      phoneNumber: ['2345 6789'],
      brands: [
        {
          identifiers: { hypePropertyValueId: 'legacy-brand' },
          names: { en: 'Bakery brand', 'zh-hant': '品牌' },
        },
      ],
    })
    const local = await createLocalPlace(
      db,
      'p',
      { state: 'unresolved', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      placeId: local.placeId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    }
    const before = ['feature', 'featureI18n', 'featureProperty'].map(table =>
      sqlite.prepare(`SELECT * FROM ${table}`).all(),
    )
    const linked = await linkInitialFeaturePlace(db, input)
    expect(linked.status).toBe('linked')
    expect((await getAcceptedFeaturePlace(db, 'f', 'p'))?.effective).toEqual(
      baseline.baseline.effective,
    )
    expect(
      ['feature', 'featureI18n', 'featureProperty'].map(table =>
        sqlite.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before)
    expect(await linkInitialFeaturePlace(db, input)).toEqual({ status: 'conflict' })
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featurePlaceHistory').get(),
    ).toEqual({ n: 1 })
  })

  it('excludes non-place Features and refuses invalid phones and private cross-project sources', async () => {
    const { db, sqlite } = setup()
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec("INSERT INTO featureI18n VALUES ('f','en','Bakery',NULL)")
    expect(await readFeaturePlaceBaseline(db, 'f', 'other')).toEqual({
      status: 'ineligible',
      reason: 'not-found',
    })
    sqlite.exec('UPDATE feature SET isIntangible=1')
    expect(await readFeaturePlaceBaseline(db, 'f', 'p')).toEqual({
      status: 'ineligible',
      reason: 'intangible',
    })
    sqlite.exec(`UPDATE feature SET isIntangible=0;
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property VALUES ('phone','phoneNumber','hub','core');
      INSERT INTO featureProperty VALUES ('f','phone',NULL,'call the manager');`)
    expect(await readFeaturePlaceBaseline(db, 'f', 'p')).toEqual({
      status: 'review',
      reason: 'invalid-phone',
    })
    sqlite.exec('DELETE FROM featureProperty')
    const local = await createLocalPlace(
      db,
      'other',
      { state: 'manual', facts },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      placeId: local.placeId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    }
    expect(await linkInitialFeaturePlace(db, input)).toEqual({
      status: 'place-unavailable',
    })
    expect(
      await linkInitialFeaturePlace(db, {
        ...input,
        expectedFeatureModifiedAt: 'stale',
      }),
    ).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM featurePlace').get()).toEqual({
      n: 0,
    })
  })
})

describe('atomic linked Feature relation replacement', () => {
  it('gates all deletes/inserts, retains other Features, and rolls back a late error', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`ALTER TABLE featureI18n ADD COLUMN titleGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN description TEXT;
      ALTER TABLE featureI18n ADD COLUMN descriptionGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN displayAddressGen INTEGER;
      ALTER TABLE featureI18n ADD COLUMN addressProperties TEXT;
      CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO featureI18n(featureId,locale,title) VALUES ('f','en','Old name'),('unrelated','en','Keep me');
      INSERT INTO featureProperty VALUES ('f','old',NULL,'old value'),('unrelated','other',NULL,'Keep me');
      INSERT INTO featurePropertyI18n VALUES ('f','old','en','old translation',0);`)
    const local = await createLocalPlace(db, 'p', { state: 'manual', facts }, 'actor')
    const input = {
      featureId: 'f',
      projectId: 'p',
      expectedFeatureModifiedAt: 'original',
      expectedRevision: null,
      placeId: local.placeId,
      factsRevisionId: local.revisionId,
      locationRevisionId: local.revisionId,
      overrides: {},
      actorId: 'actor',
    }
    const snapshot = () =>
      [
        'featureI18n',
        'featureProperty',
        'featurePropertyI18n',
        'featurePlace',
        'featurePlaceHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const properties = Array.from({ length: 150 }, (_, i) => ({
      propertyId: `new-${i}`,
      value: `value-${i}`,
    }))
    const submittedProperties = [
      ...properties,
      {
        propertyId: 'checkbox',
        propertyValueId: 'true',
        value: null,
        i18n: { en: { value: 'Checked', valueGen: false } },
      },
    ]
    const before = snapshot()
    const stale = prepareFeaturePlaceAssociationWrite(db, {
      ...input,
      expectedFeatureModifiedAt: 'stale',
    })
    await db.batch([
      stale.query,
      ...prepareFeaturePlaceRelations(
        db,
        'f',
        stale.revision,
        { en: { title: 'Do not save' } },
        submittedProperties,
      ),
    ])
    expect(snapshot()).toEqual(before)
    sqlite.exec(`CREATE TRIGGER reject_last BEFORE INSERT ON featureProperty WHEN NEW.propertyId='new-149'
      BEGIN SELECT RAISE(ABORT,'injected late failure'); END;`)
    const failing = prepareFeaturePlaceAssociationWrite(db, input)
    await expect(
      db.batch([
        failing.query,
        ...prepareFeaturePlaceRelations(
          db,
          'f',
          failing.revision,
          { en: { title: 'New name' } },
          submittedProperties,
        ),
      ]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    sqlite.exec('DROP TRIGGER reject_last')
    const winner = prepareFeaturePlaceAssociationWrite(db, input)
    await db.batch([
      winner.query,
      ...prepareFeaturePlaceRelations(
        db,
        'f',
        winner.revision,
        { en: { title: 'New name' }, zhHant: { title: '新名稱' } },
        submittedProperties,
      ),
    ])
    expect(
      sqlite
        .prepare(
          "SELECT locale,title FROM featureI18n WHERE featureId='f' ORDER BY locale",
        )
        .all(),
    ).toEqual([
      { locale: 'en', title: 'New name' },
      { locale: 'zh-hant', title: '新名稱' },
    ])
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM featureProperty WHERE featureId='f'")
        .get(),
    ).toEqual({ n: 151 })
    expect(
      sqlite
        .prepare("SELECT value FROM featureProperty WHERE featureId='unrelated'")
        .get(),
    ).toEqual({ value: 'Keep me' })
    expect(
      sqlite
        .prepare("SELECT count(*) AS n FROM featurePropertyI18n WHERE featureId='f'")
        .get(),
    ).toEqual({ n: 1 })
    expect(
      sqlite
        .prepare(
          "SELECT propertyValueId,value FROM featureProperty WHERE featureId='f' AND propertyId='checkbox'",
        )
        .get(),
    ).toEqual({ propertyValueId: null, value: 'true' })
    expect(
      sqlite
        .prepare(
          "SELECT locale,value,valueGen FROM featurePropertyI18n WHERE featureId='f'",
        )
        .all(),
    ).toEqual([{ locale: 'en', value: 'Checked', valueGen: 0 }])
    expect(
      sqlite.prepare('SELECT count(*) AS n FROM featurePlaceHistory').get(),
    ).toEqual({ n: 1 })
  })
})

describe('linked Feature form persistence', () => {
  it('updates edited overrides and materialized rows atomically while preserving inherited names', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    // Add the real schema columns to this lightweight D1 fixture for full-row RETURNING.
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery','Original address');
      INSERT INTO hub VALUES ('core','core');
      INSERT INTO property VALUES ('phone','phoneNumber','hub','core');`)
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    sqlite.exec(readFileSync('migrations/0109_place_association_scope.sql', 'utf8'))
    const local = await createLocalPlace(
      db,
      'p',
      { state: 'manual', facts: { ...facts, phoneNumber: [] } },
      'actor',
    )
    const link = await linkInitialFeaturePlace(db, {
      featureId: 'f',
      projectId: 'p',
      placeId: local.placeId,
      revisionId: local.revisionId,
      expectedFeatureModifiedAt: 'original',
      actorId: 'actor',
    })
    expect(link.status).toBe('linked')
    const input = {
      featureId: 'f',
      projectId: 'p',
      actorId: 'editor',
      updatedAt: 'original',
      data: { isVisitable: true },
      i18n: {
        en: {
          title: 'Bakery',
          description: 'Collection instructions',
          displayAddress: 'Original address',
        },
      },
      properties: [{ propertyId: 'phone', value: '["+85291234567","+85223456789"]' }],
    }
    const saved = await saveLinkedFeatureForm(db, input)
    expect(saved.status).toBe('saved')
    if (saved.status !== 'saved') throw new Error('Expected save')
    const accepted = await getAcceptedFeaturePlace(db, 'f', 'p')
    expect(accepted?.effective.phoneNumber).toEqual(['+85291234567', '+85223456789'])
    const stored = sqlite.prepare('SELECT overrides FROM featurePlace').get()
    expect(JSON.parse(stored!.overrides as string)).toEqual({
      phoneNumber: { mode: 'override', value: ['+85291234567', '+85223456789'] },
    })
    expect(
      sqlite
        .prepare("SELECT title,description FROM featureI18n WHERE featureId='f'")
        .get(),
    ).toEqual({ title: 'Bakery', description: 'Collection instructions' })
    expect(
      sqlite.prepare("SELECT value FROM featureProperty WHERE featureId='f'").get(),
    ).toEqual({ value: '["+85291234567","+85223456789"]' })
    expect(await saveLinkedFeatureForm(db, input)).toEqual({ status: 'conflict' })
    const snapshot = () =>
      [
        'feature',
        'featureI18n',
        'featureProperty',
        'featurePlace',
        'featurePlaceHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const before = snapshot()
    sqlite.exec(`CREATE TRIGGER reject_title BEFORE INSERT ON featureI18n WHEN NEW.title='Failure'
      BEGIN SELECT RAISE(ABORT,'injected save failure'); END`)
    await expect(
      saveLinkedFeatureForm(db, {
        ...input,
        updatedAt: saved.feature.modifiedAt,
        i18n: { en: { title: 'Failure', displayAddress: 'Original address' } },
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(
      await saveLinkedFeatureForm(db, {
        ...input,
        updatedAt: saved.feature.modifiedAt,
        data: { projectId: 'other' },
      }),
    ).toMatchObject({ status: 'review' })
    expect(snapshot()).toEqual(before)
    // A reported-missing task owns the Feature flag, not the physical Place identity.
    const reportedAt = new Date(Date.parse(saved.feature.modifiedAt) + 1).toISOString()
    sqlite
      .prepare("UPDATE feature SET isIntangible=1, modifiedAt=? WHERE id='f'")
      .run(reportedAt)
    expect(await readFeaturePlaceBaseline(db, 'f', 'p')).toEqual({
      status: 'ineligible',
      reason: 'intangible',
    })
    const editedMissing = await saveLinkedFeatureForm(db, {
      ...input,
      updatedAt: reportedAt,
      data: {},
      i18n: {
        en: { title: 'Retained historical donor', displayAddress: 'Original address' },
      },
    })
    expect(editedMissing.status).toBe('saved')
    expect((await getAcceptedFeaturePlace(db, 'f', 'p'))?.effective.names.en).toBe(
      'Retained historical donor',
    )
    expect(
      sqlite.prepare("SELECT isIntangible FROM feature WHERE id='f'").get(),
    ).toEqual({ isIntangible: 1 })
  })
})

describe('initial association versus unlinked form saves', () => {
  it('serializes either winner and rolls back the complete unlinked form on failure', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(`CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER);
      INSERT INTO featureI18n(featureId,locale,title,displayAddress) VALUES ('f','en','Bakery','Original address');`)
    sqlite
      .prepare("UPDATE feature SET geometry=? WHERE id='f'")
      .run(JSON.stringify(facts.location.geometry))
    const snapshot = () =>
      [
        'feature',
        'featureI18n',
        'featureProperty',
        'featurePlace',
        'featurePlaceHistory',
      ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
    const local = await createLocalPlace(
      db,
      'p',
      { state: 'unresolved', facts: { ...facts, phoneNumber: [] } },
      'actor',
    )
    const input = {
      featureId: 'f',
      projectId: 'p',
      updatedAt: 'original',
      data: { isVisitable: true },
      i18n: { en: { title: 'Edited bakery', displayAddress: 'Original address' } },
      properties: [],
    }
    const original = snapshot()
    sqlite.exec(`CREATE TRIGGER fail_form BEFORE INSERT ON featureI18n
      BEGIN SELECT RAISE(ABORT,'injected form failure'); END`)
    await expect(saveUnlinkedFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(original)
    sqlite.exec('DROP TRIGGER fail_form')
    const saved = await saveUnlinkedFeatureForm(db, input)
    expect(saved).toBeDefined()
    expect(
      sqlite.prepare("SELECT title FROM featureI18n WHERE featureId='f'").get(),
    ).toEqual({ title: 'Edited bakery' })
    expect(await saveUnlinkedFeatureForm(db, input)).toBeUndefined()
    const link = {
      featureId: 'f',
      projectId: 'p',
      placeId: local.placeId,
      revisionId: local.revisionId,
      actorId: 'actor',
      expectedFeatureModifiedAt: 'original',
    }
    expect(await linkInitialFeaturePlace(db, link)).toEqual({ status: 'conflict' })
    expect(
      await linkInitialFeaturePlace(db, {
        ...link,
        expectedFeatureModifiedAt: saved!.modifiedAt,
      }),
    ).toMatchObject({ status: 'linked' })
    expect((await getAcceptedFeaturePlace(db, 'f', 'p'))?.effective.names.en).toBe(
      'Edited bakery',
    )
    const linked = snapshot()
    // Initial linking preserves modifiedAt, so the association guard is essential here.
    expect(
      await saveUnlinkedFeatureForm(db, {
        ...input,
        updatedAt: saved!.modifiedAt,
        i18n: { en: { title: 'Must not overwrite' } },
      }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(linked)
  })
})

describe('atomic Feature creation and draft lifecycle', () => {
  it('rolls back incomplete creation and refuses to overwrite a finalized draft', async () => {
    const { db, sqlite } = setup()
    const { getTableColumns } = await import('drizzle-orm')
    const { feature, featureI18n } = await import('#lib/db/schema/feature.js')
    const { FeatureInsert } = await import('#lib/db/zod/schema/feature.js')
    for (const [name, table] of [
      ['feature', feature],
      ['featureI18n', featureI18n],
    ] as const) {
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table)))
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
    }
    sqlite.exec(
      'CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT,valueGen INTEGER)',
    )
    const input = {
      data: FeatureInsert.parse({
        id: 'created',
        organisationId: 'org',
        projectId: 'p',
        layerId: 'layer',
        geometry: facts.location.geometry,
        isDraft: true,
      }),
      i18n: { en: { title: 'New draft' } },
      properties: [],
    }
    const snapshot = () =>
      ['feature', 'featureI18n', 'featureProperty'].map(table =>
        sqlite.prepare(`SELECT * FROM ${table}`).all(),
      )
    const before = snapshot()
    sqlite.exec(`CREATE TRIGGER reject_creation BEFORE INSERT ON featureI18n WHEN NEW.featureId='created'
      BEGIN SELECT RAISE(ABORT,'injected creation failure'); END`)
    await expect(createFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    sqlite.exec('DROP TRIGGER reject_creation')
    const created = await createFeatureForm(db, input)
    expect(created).toMatchObject({ id: 'created', isDraft: true })
    expect(
      sqlite.prepare("SELECT title FROM featureI18n WHERE featureId='created'").get(),
    ).toEqual({ title: 'New draft' })
    const complete = snapshot()
    await expect(createFeatureForm(db, input)).rejects.toThrow()
    expect(snapshot()).toEqual(complete)
    const finalized = await saveUnlinkedFeatureForm(db, {
      featureId: created.id,
      projectId: 'p',
      updatedAt: created.modifiedAt,
      expectedDraftState: true,
      data: { isDraft: false },
      i18n: { en: { title: 'Submitted feature' } },
    })
    expect(finalized?.isDraft).toBe(false)
    const finalState = snapshot()
    expect(
      await saveUnlinkedFeatureForm(db, {
        featureId: created.id,
        projectId: 'p',
        updatedAt: finalized!.modifiedAt,
        expectedDraftState: true,
        data: { isDraft: true },
        i18n: { en: { title: 'Late draft edit' } },
      }),
    ).toBeUndefined()
    expect(snapshot()).toEqual(finalState)
  })
})

describe('Place link field authorization', () => {
  it.each([
    ['maintainer', 'p', false, true],
    ['owner', 'p', false, true],
    ['translator', 'p', false, false],
    ['maintainer', 'other', false, false],
    ['owner', 'p', true, false],
  ] as const)(
    'checks %s in %s anonymous=%s',
    (role, projectId, isAnonymous, allowed) => {
      const decision = authorizeFeatureUpdateForSubmission({
        user: { id: 'u', isAnonymous },
        userRoles: [{ type: 'project', role, projectId, userId: 'u' } as UserRoleDisco],
        resource: {
          id: 'f',
          projectId: 'p',
          organisationId: 'org',
          resourceHubId: 'hub',
        },
        submittedData: {
          i18n: true,
          properties: true,
          geometry: true,
          addressMeta: true,
        },
      })
      expect(decision.allowed).toBe(allowed)
    },
  )
})
