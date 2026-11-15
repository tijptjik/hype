// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
// API
import { guardedCommand } from './server/guarded'
// SCHEMA
import { systemTask } from '#lib/db/schema/systemTask.js'

/** Record a system-issue review without changing a map or its corrections.
 * @param input Issue identity, expected revision and result. @returns The updated issue.
 * @remarks Review acknowledges the issue; map edits and publication remain explicit operations.
 */
export const reviewSystemTask = guardedCommand(
  z.object({
    meta: z.object({ isAdminRequest: z.boolean() }),
    id: z.string().min(1),
    expectedModifiedAt: z.string(),
    outcome: z.enum(['accepted', 'rejected']),
  }),
  async (input, ctx) => {
    if (!ctx.isAdminRequest || !ctx.user.superAdmin || ctx.user.isAnonymous)
      error(403, 'INSUFFICIENT_ROLE')
    const [row] = await ctx.db
      .update(systemTask)
      .set({
        isReviewed: true,
        reviewOutcome: input.outcome,
        reviewerId: ctx.user.id,
        modifiedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(systemTask.id, input.id),
          eq(systemTask.modifiedAt, input.expectedModifiedAt),
          eq(systemTask.isReviewed, false),
        ),
      )
      .returning()
    if (!row) error(409, 'TASK_CHANGED')
    return row
  },
)
