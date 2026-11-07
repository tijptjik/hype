// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { lifecycleFixture } from './fixtures/featureLifecycle'
import { withRemoteMeta } from './remote-function-mock'
import {
  saveFeatureCreationTaskDraft,
  submitFeatureCreationTask,
} from '#lib/db/services/featureLifecycleCreationTask.js'
import { saveFeatureCreationUpload } from '#lib/db/services/featureLifecycleCreationUpload.js'

const state = vi.hoisted(() => ({ ctx: null as any, allowed: new Set<string>() }))
vi.mock('#lib/api/server/guarded', () => {
  const remote = (schema: any, handler: any) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), state.ctx),
      'command',
    )
  return { guardedCommand: remote, guardedQuery: remote }
})
vi.mock('#lib/properties/audience.server.js', () => ({
  getInternalPropertyAccess: async () => ({ allowed: state.allowed }),
}))
import {
  inspectCreationDuplicate,
  applyCreationDuplicate,
} from '#lib/api/featureCreationDuplicate.remote.js'
const connections: ReturnType<typeof lifecycleFixture>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})

it.each(['latest', 'keep', 'clear'] as const)('reviews proposal-only duplicates with %s last seen and rejects stale replay', async dateChoice => {
  const f = lifecycleFixture()
  connections.push(f)
  const initial = await f.initialize(false)
  state.allowed = new Set(Object.keys(initial.content.properties))
  state.ctx = {
    db: f.db,
    user: { id: 'reviewer', superAdmin: true },
    userRoles: [],
    isAdminRequest: true,
  }
  const content = structuredClone(initial.content)
  content.gallery = { entries: {}, order: [] }
  content.profile.visitability.asOf = '2026-11-07'
  const draft = await saveFeatureCreationTaskDraft(f.db, {
    actorId: 'contributor',
    scope: { organisationId: 'org', projectId: 'project', layerId: 'layer' },
    content,
    checks: [],
  })
  const photo = await saveFeatureCreationUpload(f.db, {
    taskId: draft.task.id,
    actorId: 'contributor',
    storageNamespace: 'local',
    storageKey: 'duplicate-photo',
    mediaType: 'image/jpeg',
    bytes: new Uint8Array([1, 2]).buffer,
    metadata: { version: 1 },
  })
  await submitFeatureCreationTask(f.db, {
    taskId: draft.task.id,
    actorId: 'contributor',
  })
  const input = { taskId: draft.task.id, primaryId: 'f' }
  const inspected = await inspectCreationDuplicate(input)
  const [primary, candidate] = inspected.sources
  const selection = {
    kind: 'merge' as const,
    inputs: inspected.sources.map(({ featureId, revisionId, generation }) => ({
      featureId,
      revisionId,
      generation,
    })),
    outputs: [
      {
        featureId: 'f',
        sourceFeatureId: 'f',
        ...(dateChoice === 'latest' ? {} : { profileEdits: { asOf: dateChoice === 'clear' ? null : primary.content.profile.visitability.asOf } }),
        images: [
          ...primary.content.gallery.order.map(imageId => ({
            sourceFeatureId: 'f',
            imageId,
          })),
          { sourceFeatureId: candidate.featureId, imageId: photo.imageId },
        ],
      },
    ],
    reason: 'Duplicate with a newer photo',
  }
  const command = {
    ...input,
    proposalId: inspected.proposalId,
    version: inspected.version,
    modifiedAt: inspected.modifiedAt,
    selection,
  }
  state.ctx.user = { id: 'intruder' }
  await expect(applyCreationDuplicate(command)).rejects.toMatchObject({ status: 403 })
  state.ctx.user = { id: 'reviewer', superAdmin: true }
  await expect(
    applyCreationDuplicate({ ...command, version: 'stale' }),
  ).rejects.toMatchObject({ status: 409 })
  expect(await applyCreationDuplicate(command)).toEqual({ outputs: ['f'] })
  expect(f.sqlite.prepare('SELECT count(*) n FROM feature').get()?.n).toBe(1)
  expect(
    f.sqlite.prepare('SELECT count(*) n FROM featureIdentityOperation').get()?.n,
  ).toBe(0)
  expect(
    f.sqlite.prepare('SELECT isPublished FROM feature WHERE id=?').get('f')
      ?.isPublished,
  ).toBe(0)
  const latest = await f.db.get<{ content: string }>(
    sql`SELECT content FROM featureRevision WHERE id=(SELECT currentRevisionId FROM feature WHERE id='f')`,
  )
  expect(JSON.parse(latest!.content).gallery.order).toContain(photo.imageId)
  expect(JSON.parse(latest!.content).profile.visitability.asOf).toBe(
    dateChoice === 'latest' ? '2026-11-07' : dateChoice === 'clear' ? null : primary.content.profile.visitability.asOf,
  )
  await expect(applyCreationDuplicate(command)).rejects.toMatchObject({ status: 409 })
  expect(f.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
