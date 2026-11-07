// SCHEMA
import { revisionChangeSet } from '../schema/featureRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

export type RevisionCommand = {
  actorId: string
  // Trusted jobs/importers retain their own origin; never accepted from a remote form.
  origin?: typeof revisionChangeSet.$inferInsert.origin
  // Optional live account link for legacy public attribution; audit actors also include jobs.
  publisherUserId?: string | null
  reason?: string
  /** Explicit submission, review, publication or identity operation; seals the edit window. */
  revisionBoundary?: boolean
  // Server-built current authorization, ancestry and projection-drift predicates.
  guard: SQL
}
/**
 * Prepares durable server-side attribution for an operation.
 * @param db Request database.
 * @param command Authorized actor and optional reason.
 * @param origin Source of the operation.
 * @returns Identifier and unexecuted single-row insert.
 */
export function prepareRevisionChangeSet(
  db: Database,
  command: Pick<RevisionCommand, 'actorId' | 'reason' | 'origin'>,
  origin: typeof revisionChangeSet.$inferInsert.origin = command.origin ?? 'user',
): { id: string; statement: BatchItem<'sqlite'> } {
  if (!command.actorId.trim()) throw new Error('Revision actor is required')
  const id = crypto.randomUUID()
  return {
    id,
    statement: db.insert(revisionChangeSet).values({
      id,
      actorId: command.actorId,
      reason: command.reason,
      origin,
      createdAt: new Date().toISOString(),
    }),
  }
}
