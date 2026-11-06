// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureRevisionWriteScope } from '../schema/featureRevisionWriteScope'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/**
 * Opens and closes a projection write scope inside its already-validated revision transaction.
 * @param db Request database.
 * @param featureId Enrolled identity whose complete accepted projection is being updated.
 * @returns Statements enclosing projection, history and verification in ONE batch.
 * @remarks Importers and legacy writers receive no scope. A failure rolls it back; a successful
 * transaction must close it. Installing the guard migration does not enroll any identity.
 */
export async function prepareFeatureRevisionWriteScope(db: Database, featureId: string): Promise<{
  before: BatchItem<'sqlite'>[]; after: BatchItem<'sqlite'>[]
}> {
  const storage = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featureRevisionWriteScope' AND type='table'`)
  if (!storage?.n) return { before: [], after: [] }
  const token = crypto.randomUUID()
  return {
    before: [db.insert(featureRevisionWriteScope).values({ featureId, token })],
    after: [db.delete(featureRevisionWriteScope).where(and(eq(featureRevisionWriteScope.featureId, featureId), eq(featureRevisionWriteScope.token, token))),
      prepareRevisionCheck(db, sql`NOT EXISTS (SELECT 1 FROM featureRevisionWriteScope WHERE featureId=${featureId})`)],
  }
}
