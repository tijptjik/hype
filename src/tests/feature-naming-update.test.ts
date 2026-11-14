// @vitest-environment node
// TESTS
import { afterEach, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
// SERVICES
import { previewFeatureNamingUpdate } from '#lib/db/services/featureNamingUpdate.js'
import {
  prepareFeatureIntentPolicySave,
  readFeatureIntentPolicy,
} from '#lib/db/services/featureIntentPolicy.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import {
  readCurrentFeatureRevision,
  saveFeatureEdit,
} from '#lib/db/services/featureLifecycle.js'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { required } from './fixtures/required'
const fixtures: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of fixtures.splice(0)) f.sqlite.close()
})
const scope = { type: 'project' as const, id: 'project' }
const rule = {
  base: 'feature' as const,
  conditions: [],
  registry: { id: 'template', version: 1 },
}
async function fixture(unclassified = false) {
  const f = lifecycleFixture(false, false, 100)
  fixtures.push(f)
  f.sqlite.exec(`CREATE TABLE featureIntentPolicy(scopeType TEXT,scopeId TEXT,definition TEXT,namingRules TEXT DEFAULT '{}',version INTEGER,actorId TEXT,PRIMARY KEY(scopeType,scopeId));
    CREATE TABLE featureIntentPolicyRevision(id TEXT PRIMARY KEY,scopeType TEXT,scopeId TEXT,definition TEXT,namingRules TEXT,version INTEGER,actorId TEXT,createdAt TEXT);
    UPDATE feature SET featureType='object'; INSERT INTO user(id) VALUES('editor');
    CREATE TABLE featureDisplayTemplateOutput(featureId TEXT,locale TEXT,templateId TEXT,templateVersion INTEGER,title TEXT,PRIMARY KEY(featureId,locale));`)
  f.sqlite.exec(readFileSync('migrations/0234_display_template_registry.sql', 'utf8'))
  f.sqlite.exec('BEGIN')
  f.sqlite
    .prepare('INSERT INTO displayTemplate VALUES(?,?,?,?)')
    .run('template', null, 'test', 1)
  f.sqlite.prepare('INSERT INTO displayTemplateRevision VALUES(?,?,?,?,?)').run(
    'template',
    1,
    JSON.stringify({
      name: 'New',
      code: 'test',
      target: 'feature',
      locales: { en: 'New {{ feature.name }}' },
    }),
    'editor',
    'now',
  )
  f.sqlite.exec('COMMIT')
  if (unclassified) f.sqlite.exec('UPDATE feature SET featureType=NULL')
  await f.initialize()
  const current = await readFeatureIntentPolicy(f.db, scope)
  const patch = {
    definition: null,
    namingRules: { object: rule },
    version: current.version,
    fingerprint: current.fingerprint,
  }
  return { ...f, patch }
}
it('previews without writes and atomically adopts with accepted history and output', async () => {
  const f = await fixture()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch: f.patch })
  expect(preview.rows[0].status).toBe('update')
  expect(preview.rows[0].names.find(row => row.locale === 'en')?.after).toMatch(/^New /)
  expect(
    required(await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))
      ?.revisionId,
  ).toBe(before?.revisionId)
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...f.patch,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  expect(writes).not.toBeNull()
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).not.toBeNull()
  const after = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  expect(after?.content.profile.nameTemplate?.rule).toEqual(rule)
  expect(after?.revisionId).not.toBe(before?.revisionId)
  expect(after?.state).toEqual(before?.state)
  expect(
    f.sqlite
      .prepare("SELECT title FROM featureDisplayTemplateOutput WHERE locale='en'")
      .get()?.title,
  ).toBe(preview.rows[0].names.find(row => row.locale === 'en')?.after)
})
it('new-only saves leave accepted Features untouched', async () => {
  const f = await fixture()
  const before = await readCurrentFeatureRevision(f.db, {
    featureId: 'f',
    guard: sql`1`,
  })
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...f.patch,
    scope,
    actorId: 'editor',
  })
  await executeRevisionBatch(f.db, sql`1`, required(writes))
  expect(
    required(await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }))
      ?.revisionId,
  ).toBe(before?.revisionId)
})
it('excludes a closer naming override even if it matches the previous default', async () => {
  const f = await fixture()
  f.sqlite
    .prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)')
    .run(
      'layer',
      'layer',
      null,
      JSON.stringify({ object: { base: 'feature', conditions: [] } }),
      1,
      'editor',
    )
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch: f.patch })
  expect(preview.rows[0].status).toBe('descendant')
})
it('preserves explicit assignment history even when the current rule matches the default', async () => {
  const f = await fixture()
  const current = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    guard: sql`1`,
    reason: 'Change central display template',
    revisionBoundary: true,
    derive: content => {
      content.translations.en.description.value = 'Explicit assignment receipt'
      return content
    },
    validate: () => [],
  })
  expect(
    (await previewFeatureNamingUpdate(f.db, { scope, patch: f.patch })).rows[0].status,
  ).toBe('override')
})
it('rejects stale review tokens and rolls back when a Feature changes after preparation', async () => {
  const f = await fixture()
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch: f.patch })
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...f.patch,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  const current = required(
    await readCurrentFeatureRevision(f.db, {
      featureId: 'f',
      guard: sql`1`,
    }),
  )
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    guard: sql`1`,
    derive: content => {
      content.translations.en.description.value = 'Changed'
      return content
    },
    validate: () => [],
  })
  await expect(
    prepareFeatureIntentPolicySave(f.db, {
      ...f.patch,
      scope,
      actorId: 'editor',
      namingUpdateToken: preview.token,
    }),
  ).rejects.toThrow('Review')
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).toBeNull()
  expect(f.sqlite.prepare('SELECT count(*) n FROM featureIntentPolicy').get()?.n).toBe(
    0,
  )
})

it('preserves manual names and different accepted rules', async () => {
  const f = await fixture()
  const current = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  const ownRule = { base: 'feature' as const, conditions: [] }
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    guard: sql`1`,
    derive: content => {
      content.profile.nameTemplate = { rule: ownRule }
      content.translations.en.nameOverride = 'Keep this name'
      return content
    },
    validate: () => [],
  })
  f.sqlite
    .prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)')
    .run('project', 'project', null, JSON.stringify({ object: ownRule }), 1, 'editor')
  const policy = await readFeatureIntentPolicy(f.db, scope)
  const preview = await previewFeatureNamingUpdate(f.db, {
    scope,
    patch: { ...f.patch, version: policy.version, fingerprint: policy.fingerprint },
  })
  expect(preview.rows[0].status).toBe('override')
})
it('never includes a Feature outside the authorized scope', async () => {
  const f = await fixture()
  const otherScope = { type: 'project' as const, id: 'other' }
  f.sqlite.exec("INSERT INTO project(id,organisationId) VALUES('other','org')")
  const policy = await readFeatureIntentPolicy(f.db, otherScope)
  const preview = await previewFeatureNamingUpdate(f.db, {
    scope: otherScope,
    patch: { ...f.patch, version: policy.version, fingerprint: policy.fingerprint },
  })
  expect(preview.rows).toEqual([])
})

it('includes unclassified records only when their accepted rule identifies one default', async () => {
  const f = await fixture(true)
  const current = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  const ownRule = { base: 'feature' as const, conditions: [] }
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    guard: sql`1`,
    derive: content => {
      content.profile.nameTemplate = { rule: ownRule }
      return content
    },
    validate: () => [],
  })
  f.sqlite
    .prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)')
    .run('project', 'project', null, JSON.stringify({ object: ownRule }), 1, 'editor')
  const policy = await readFeatureIntentPolicy(f.db, scope)
  const preview = await previewFeatureNamingUpdate(f.db, {
    scope,
    patch: { ...f.patch, version: policy.version, fingerprint: policy.fingerprint },
  })
  expect(preview.rows[0].status).toBe('update')
})

it('resets only reviewed descendant rules, including empty layers, with attributed history', async () => {
  const f = await fixture()
  f.sqlite.exec("INSERT INTO layer(id,projectId) VALUES('empty','project')")
  for (const id of ['layer', 'empty'])
    f.sqlite.prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)').run(
      'layer',
      id,
      null,
      JSON.stringify({
        object: { base: 'feature', conditions: [] },
        place: { base: 'location', conditions: [] },
      }),
      1,
      'editor',
    )
  const patch = {
    ...f.patch,
    namingUpdateOptions: { typeIds: ['object'], resetRules: true, resetTitles: false },
  }
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch })
  expect(preview.resetScopes).toHaveLength(2)
  expect(preview.rows[0].status).toBe('update')
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...patch,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).not.toBeNull()
  for (const id of ['layer', 'empty']) {
    const policy = await readFeatureIntentPolicy(f.db, { type: 'layer', id })
    expect(policy.namingRules?.object).toBeUndefined()
    expect(policy.namingRules?.place).toEqual({ base: 'location', conditions: [] })
    expect(policy.types.find(t => t.id === 'object')?.nameRule).toEqual(rule)
  }
  expect(
    f.sqlite
      .prepare(
        "SELECT count(*) n FROM featureIntentPolicyRevision WHERE scopeType='layer'",
      )
      .get()?.n,
  ).toBe(2)
})

it('requires a new review when reset choices change, and clears custom titles only by explicit choice', async () => {
  const f = await fixture()
  const ownRule = { base: 'feature' as const, conditions: [] }
  const current = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    guard: sql`1`,
    derive: content => {
      content.profile.nameTemplate = {
        rule: ownRule,
        overrides: { en: 'Legacy custom' },
      }
      content.translations.en.nameOverride = 'Custom title'
      return content
    },
    validate: () => [],
  })
  const keep = {
    ...f.patch,
    namingUpdateOptions: { typeIds: ['object'], resetRules: true, resetTitles: false },
  }
  const keepPreview = await previewFeatureNamingUpdate(f.db, { scope, patch: keep })
  expect(keepPreview.rows[0].status).toBe('update')
  expect(keepPreview.rows[0].names.find(name => name.locale === 'en')?.after).toBe(
    'Custom title',
  )
  const reset = {
    ...keep,
    namingUpdateOptions: { ...keep.namingUpdateOptions, resetTitles: true },
  }
  await expect(
    prepareFeatureIntentPolicySave(f.db, {
      ...reset,
      scope,
      actorId: 'editor',
      namingUpdateToken: keepPreview.token,
    }),
  ).rejects.toThrow('Review')
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch: reset })
  expect(preview.rows[0].status).toBe('update')
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...reset,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).not.toBeNull()
  const after = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  expect(after.content.translations.en.nameOverride).toBeNull()
  expect(after.content.profile.nameTemplate?.overrides).toEqual({})
  expect(after.content.profile.nameTemplate?.rule).toEqual(rule)
})

it('fences newly added descendant custom rules after review', async () => {
  const f = await fixture()
  const patch = {
    ...f.patch,
    namingUpdateOptions: { typeIds: ['object'], resetRules: true, resetTitles: false },
  }
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch })
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...patch,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  f.sqlite
    .prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)')
    .run('layer', 'layer', null, JSON.stringify({ object: rule }), 1, 'editor')
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).toBeNull()
})

it('makes a reset feature follow later defaults despite older explicit assignment history', async () => {
  const f = await fixture()
  const current = required(
    await readCurrentFeatureRevision(f.db, { featureId: 'f', guard: sql`1` }),
  )
  await saveFeatureEdit(f.db, {
    featureId: 'f',
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    actorId: 'editor',
    reason: 'Change central display template',
    guard: sql`1`,
    derive: content => {
      content.translations.en.description.value = 'Explicit'
      return content
    },
    validate: () => [],
  })
  const patch = {
    ...f.patch,
    namingUpdateOptions: { typeIds: ['object'], resetRules: true, resetTitles: false },
  }
  const preview = await previewFeatureNamingUpdate(f.db, { scope, patch })
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...patch,
    scope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).not.toBeNull()
  const policy = await readFeatureIntentPolicy(f.db, scope)
  const later = {
    definition: null,
    namingRules: { object: { base: 'feature' as const, conditions: [] } },
    version: policy.version,
    fingerprint: policy.fingerprint,
  }
  const next = await previewFeatureNamingUpdate(f.db, { scope, patch: later })
  expect(next.rows[0].status).toBe('update')
})

it('hub resets stay within the hub and include organisation, project and empty layer overrides', async () => {
  const f = await fixture()
  f.sqlite.exec(
    "INSERT INTO hub VALUES('core-hub','core'),('other-hub','other'); INSERT INTO organisation(id,hubId,isPublished,isArchived) VALUES('outside','other-hub',1,0); INSERT INTO project(id,organisationId,isPublished,isArchived) VALUES('outside-project','outside',1,0); INSERT INTO layer(id,organisationId,projectId,isPublished,isArchived) VALUES('outside-layer','outside','outside-project',1,0)",
  )
  for (const [type, id] of [
    ['organisation', 'org'],
    ['project', 'project'],
    ['layer', 'layer'],
    ['organisation', 'outside'],
    ['project', 'outside-project'],
    ['layer', 'outside-layer'],
  ])
    f.sqlite
      .prepare('INSERT INTO featureIntentPolicy VALUES(?,?,?,?,?,?)')
      .run(
        type,
        id,
        null,
        JSON.stringify({ object: { base: 'feature', conditions: [] } }),
        1,
        'editor',
      )
  const hubScope = { type: 'hub' as const, id: 'core-hub' }
  const policy = await readFeatureIntentPolicy(f.db, hubScope)
  const patch = {
    ...f.patch,
    version: policy.version,
    fingerprint: policy.fingerprint,
    namingUpdateOptions: { typeIds: ['object'], resetRules: true, resetTitles: false },
  }
  const preview = await previewFeatureNamingUpdate(f.db, { scope: hubScope, patch })
  expect(preview.resetScopes?.map(item => item.id).sort()).toEqual([
    'layer',
    'org',
    'project',
  ])
  const writes = await prepareFeatureIntentPolicySave(f.db, {
    ...patch,
    scope: hubScope,
    actorId: 'editor',
    namingUpdateToken: preview.token,
  })
  expect(await executeRevisionBatch(f.db, sql`1`, required(writes))).not.toBeNull()
  expect(
    (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'layer' })).types.find(
      t => t.id === 'object',
    )?.nameRule,
  ).toEqual(rule)
  expect(
    (await readFeatureIntentPolicy(f.db, { type: 'layer', id: 'outside-layer' }))
      .namingRules?.object,
  ).toEqual({ base: 'feature', conditions: [] })
})
