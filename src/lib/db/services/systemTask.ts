// DRIZZLE
import { and, eq, like, or } from 'drizzle-orm'
// SCHEMA
import { systemTask } from '../schema/systemTask'
// TYPES
import type { Database } from '#lib/types.js'
import type { SystemTask, TaskResource } from '#lib/tasks.system.js'

/** Read system issues after caller authorization, sharing result/reviewed filters with Feature tasks.
 * @param db Request database. @param input Relevant queue filters. @returns Matching current issues.
 */
export async function listSystemTasks(
  db: Database,
  input: {
    resource?: TaskResource | null
    isReviewed?: boolean | null
    reviewOutcome?: string | null
    q?: string
  },
): Promise<SystemTask[]> {
  const conditions = []
  if (input.resource === 'premisesMap' || input.resource === 'location')
    conditions.push(eq(systemTask.resource, input.resource))
  if (input.isReviewed != null)
    conditions.push(eq(systemTask.isReviewed, input.isReviewed))
  if (input.reviewOutcome === 'accepted' || input.reviewOutcome === 'rejected')
    conditions.push(eq(systemTask.reviewOutcome, input.reviewOutcome))
  if (input.q?.trim())
    conditions.push(
      or(
        like(systemTask.title, `%${input.q.trim()}%`),
        like(systemTask.message, `%${input.q.trim()}%`),
      ),
    )
  return db
    .select()
    .from(systemTask)
    .where(and(...conditions))
}
