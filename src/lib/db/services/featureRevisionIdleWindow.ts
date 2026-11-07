// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureRevision } from '../schema/featureRevision'
import { acceptedFeatureRevision } from '../schema/featureLifecycle.target'
import { revisionEditSelection, revisionEditWindow } from '../schema/revisionEditWindow'
// SERVICES
import {
  editableRevision,
  hasRevisionEditWindows,
  revisionEditTime,
} from './revisionEditWindow'
import { prepareRevisionCheck } from './revisionBatch'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { equalRevisionValue } from '#lib/revisions/merge.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

/** Prepares one accepted snapshot edit without coupling its identity to the optimistic edit token.
 * @param db Request database.
 * @param input Authorized current snapshot and final content; workflow boundaries never coalesce.
 * @returns Stable revision identity, guarded snapshot statements and final window cleanup.
 * @remarks The caller still owns source/head generation guards, projection writes and history receipts.
 * A window lost or expired between preparation and execution rejects the entire batch for retry.
 */
export async function prepareFeatureIdleRevision(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    previousRevisionId: string
    previous: FeatureRevisionContent
    content: FeatureRevisionContent
    boundary?: boolean
    lifecycle?: { sequence: number; recordState: SQL }
  },
): Promise<{
  revisionId: string
  changeSetId: string | null
  reuse: boolean
  noop: boolean
  write: BatchItem<'sqlite'>[]
  finish: BatchItem<'sqlite'>[]
}> {
  input = { ...input, boundary: input.boundary || input.revisionBoundary }
  const installed = await hasRevisionEditWindows(db, 'feature')
  const noop =
    installed && !input.boundary && equalRevisionValue(input.previous, input.content)
  if (noop)
    return {
      revisionId: input.previousRevisionId,
      changeSetId: null,
      reuse: false,
      noop: true,
      write: [],
      finish: [],
    }
  const actor = {
    actorId: input.actorId,
    origin:
      input.origin === 'user' || input.origin === undefined
        ? ('user' as const)
        : ('system' as const),
  }
  const eligible = editableRevision('feature', sql`${input.previousRevisionId}`, actor)
  const existing =
    installed &&
    !input.boundary &&
    input.origin !== 'migration' &&
    input.origin !== 'restore'
      ? await db.get<{ changeSetId: string }>(
          sql`SELECT changeSetId FROM featureRevision WHERE id=${input.previousRevisionId} AND featureId=${input.featureId} AND (${eligible})`,
        )
      : null
  const revisionId = existing ? input.previousRevisionId : crypto.randomUUID()
  const token = crypto.randomUUID()
  const change = existing ? null : prepareRevisionChangeSet(db, input)
  const write: BatchItem<'sqlite'>[] = existing
    ? [
        prepareRevisionCheck(db, eligible),
        db.insert(revisionEditSelection).values({ token, revisionId }),
        input.lifecycle
          ? db
              .update(acceptedFeatureRevision)
              .set({
                content: JSON.stringify(input.content),
                recordState: input.lifecycle.recordState,
                sequence: input.lifecycle.sequence,
              })
              .where(eq(acceptedFeatureRevision.id, revisionId))
          : db
              .update(featureRevision)
              .set({ content: input.content })
              .where(eq(featureRevision.id, revisionId)),
      ]
    : [
        change!.statement,
        input.lifecycle
          ? db.insert(acceptedFeatureRevision).values({
              id: revisionId,
              featureId: input.featureId,
              previousRevisionId: input.previousRevisionId,
              changeSetId: change!.id,
              content: JSON.stringify(input.content),
              recordState: input.lifecycle.recordState,
              sequence: input.lifecycle.sequence,
            })
          : db.insert(featureRevision).values({
              id: revisionId,
              featureId: input.featureId,
              previousRevisionId: input.previousRevisionId,
              changeSetId: change!.id,
              content: input.content,
            }),
      ]
  const finish: BatchItem<'sqlite'>[] = installed
    ? [
        ...(!input.boundary && (input.origin ?? 'user') === 'user'
          ? [
              db
                .insert(revisionEditWindow)
                .values({
                  resource: 'feature',
                  revisionId,
                  actorId: input.actorId,
                  origin: 'user',
                  lastEditedAt: revisionEditTime,
                })
                .onConflictDoUpdate({
                  target: [revisionEditWindow.resource, revisionEditWindow.revisionId],
                  set: { lastEditedAt: revisionEditTime },
                }),
            ]
          : []),
        ...(existing
          ? [
              db
                .delete(revisionEditSelection)
                .where(eq(revisionEditSelection.token, token)),
            ]
          : []),
      ]
    : []
  return {
    revisionId,
    changeSetId: existing?.changeSetId ?? change!.id,
    reuse: Boolean(existing),
    noop: false,
    write,
    finish,
  }
}
