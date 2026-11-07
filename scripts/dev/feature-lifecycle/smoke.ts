// BUN
import { Database as SQLite } from 'bun:sqlite'
// NODE
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
// SCHEMA
import * as schema from '../../../src/lib/db/schema'
// SERVICES
import { readCurrentFeatureRevision, saveFeatureEdit } from '../../../src/lib/db/services/featureLifecycle'
import { splitLifecycleFeature, mergeLifecycleFeatures } from '../../../src/lib/db/services/featureLifecycleIdentity'
import { readFeatureLifecycleHistory } from '../../../src/lib/db/services/featureLifecycleRead'
import { readPartialFeatureProposal } from '../../../src/lib/db/services/featureLifecycleProposal'
import { reviewInitialFeatureContribution } from '../../../src/lib/db/services/featureInitialReview'
import { readFeatureCreationTask, saveFeatureCreationTaskDraft, submitFeatureCreationTask, reviewFeatureCreationTask } from '../../../src/lib/db/services/featureLifecycleCreationTask'
// TYPES
import type { SQLQueryBindings } from 'bun:sqlite'
import type { Database } from '../../../src/lib/types'

/** Exercise real migrated records through the D1 services on an ephemeral private copy.
 * @param path Audited migrated SQLite rehearsal file.
 * @param acceptCreations Accept converted drafts when true; otherwise exercise rejection.
 * @returns Counts of verified reads and accepted write operations.
 * @remarks The supplied file is opened read-only. Every mutation is discarded on close.
 */
export async function smokeFeatureLifecycle(path: string, acceptCreations = true): Promise<Record<string, number>> {
  const source = new SQLite(path, { readonly: true })
  const directory = mkdtempSync(join(tmpdir(), 'feature-lifecycle-smoke-'))
  let sqlite: SQLite
  try {
    // A disk copy supports WAL-mode snapshots without mutating their serialized headers.
    const copyPath = join(directory, 'copy.sqlite')
    writeFileSync(copyPath, source.serialize(), { mode: 0o600, flag: 'wx' })
    sqlite = new SQLite(copyPath)
  } catch (error) {
    rmSync(directory, { recursive: true, force: true })
    throw error
  } finally {
    source.close()
  }
  // Mirror the production D1 driver while keeping all transactions in the disposable copy.
  const prepare = (query: string, bindings: SQLQueryBindings[] = []) => ({
    bind: (...params: SQLQueryBindings[]) => prepare(query, params),
    all: async () => ({ results: sqlite.query(query).all(...bindings) }),
    raw: async () => sqlite.query(query).values(...bindings),
    run: async () => ({ results: [], meta: sqlite.query(query).run(...bindings) }),
  })
  const batch = async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }
  const db = drizzle({ prepare, batch } as never, { schema }) as Database
  try {
    sqlite.exec('PRAGMA foreign_keys=ON')
    const features = sqlite.query('SELECT id FROM feature ORDER BY id').all() as { id: string }[]
    for (const { id } of features) {
      assert(await readCurrentFeatureRevision(db, { featureId: id, guard: sql`1` }))
      assert((await readFeatureLifecycleHistory(db, { featureId: id, guard: sql`1` })).length)
    }
    const proposals = sqlite.query("SELECT id,featureId FROM featureRevisionProposal WHERE kind='update'").all() as { id: string; featureId: string }[]
    for (const { id, featureId } of proposals) assert(await readPartialFeatureProposal(db, { proposalId: id, featureId, guard: sql`1` }))
    const actor = sqlite.query('SELECT id FROM user LIMIT 1').get() as { id: string }
    const initialTasks = sqlite.query(`SELECT t.id,t.featureId FROM task t
      JOIN featureRevisionProposal p ON p.id=t.proposalId
      WHERE t.isDraft=0 AND t.isReviewed=0 AND p.status='submitted'
        AND json_extract(p.creationScope,'$.legacyInitial.mode')='contribution' LIMIT 2`).all() as { id: string; featureId: string }[]
    for (const [index, task] of initialTasks.entries()) {
      assert(await reviewInitialFeatureContribution(db, {
        taskId: task.id, featureId: task.featureId, actorId: actor.id,
        reason: 'Disposable migrated initial review check', accept: index === 0, guard: sql`1`, completion: [],
      }))
    }
    const migratedDrafts = sqlite.query(`SELECT t.id FROM task t JOIN featureRevisionProposal p ON p.id=t.proposalId
      WHERE t.featureId IS NULL AND t.isDraft=1 AND p.kind='create'
        AND EXISTS(SELECT 1 FROM taskImage ti WHERE ti.taskId=t.id) LIMIT 2`).all() as { id: string }[]
    for (const [index, draft] of migratedDrafts.entries()) {
      const before = await readFeatureCreationTask(db, { taskId: draft.id, guard: sql`1` })
      assert(before)
      const content = structuredClone(before.content)
      content.translations.en.title.value = 'Resumed migrated contribution'
      await saveFeatureCreationTaskDraft(db, { taskId: draft.id, actorId: before.contributorId, scope: before.scope, content, checks: [] })
      const saved = await readFeatureCreationTask(db, { taskId: draft.id, guard: sql`1` })
      assert.deepEqual(saved?.content.gallery, before.content.gallery)
      assert(await submitFeatureCreationTask(db, { taskId: draft.id, actorId: before.contributorId }))
      const submitted = await readFeatureCreationTask(db, { taskId: draft.id, guard: sql`1` })
      assert(submitted)
      const decision = await reviewFeatureCreationTask(db, { taskId: draft.id, proposalId: submitted.proposalId,
        expectedVersion: submitted.version, expectedModifiedAt: submitted.modifiedAt, actorId: actor.id,
        guard: sql`1`, accept: acceptCreations && index === 0, reason: 'Disposable converted draft review' })
      assert(decision)
      if (acceptCreations && index === 0) {
        assert(decision.featureId)
        const accepted = await readCurrentFeatureRevision(db, { featureId: decision.featureId, guard: sql`1` })
        assert.equal(accepted?.state.isPublished, false)
        assert.deepEqual(accepted?.content.gallery, before.content.gallery)
      } else assert.equal(decision.featureId, null)

    }
    let selected: Awaited<ReturnType<typeof readCurrentFeatureRevision>> = null
    for (const { id } of features) {
      const current = await readCurrentFeatureRevision(db, { featureId: id, guard: sql`1` })
      if (current && !current.retired && Object.keys(current.content.translations).length) {
        selected = current
        break
      }
    }
    assert(selected)
    const common = { featureId: selected.featureId, actorId: actor.id, guard: sql`1`, validate: () => [] }
    const edited = await saveFeatureEdit(db, {
      ...common, expectedRevisionId: selected.revisionId, expectedVersion: selected.version,
      reason: 'Disposable migration service smoke check', derive: content => content,
    })
    assert(edited)
    const split = await splitLifecycleFeature(db, {
      ...common, expectedRevisionId: edited, expectedVersion: selected.version + 1,
      titles: ['Smoke left', 'Smoke right'], locale: Object.keys(selected.content.translations)[0], redirectIndex: 0,
    })
    assert(split)
    const primary = await readCurrentFeatureRevision(db, { featureId: split.featureIds[0], guard: sql`1` })
    const secondary = await readCurrentFeatureRevision(db, { featureId: split.featureIds[1], guard: sql`1` })
    assert(primary && secondary)
    assert.equal(primary.state.isPublished, false)
    assert.equal(secondary.state.isPublished, false)
    assert(await mergeLifecycleFeatures(db, {
      ...common, featureId: split.featureIds[0], expectedRevisionId: primary.revisionId,
      expectedVersion: primary.version, derive: content => content,
      secondary: { featureId: split.featureIds[1], expectedRevisionId: secondary.revisionId, expectedVersion: secondary.version, guard: sql`1` },
    }))
    assert.deepEqual(sqlite.query('PRAGMA foreign_key_check').all(), [])
    assert.equal(Object.values(sqlite.query('PRAGMA integrity_check').get()!)[0], 'ok')
    return { features: features.length, proposals: proposals.length, acceptedWrites: 3, initialReviews: initialTasks.length, resumedDrafts: migratedDrafts.length }
  } finally {
    sqlite.close()
    rmSync(directory, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('Usage: bun smoke.ts MIGRATED-REHEARSAL.sqlite')
  console.log(JSON.stringify(await smokeFeatureLifecycle(process.argv[2], !process.argv.includes('--reject-creations'))))
}
