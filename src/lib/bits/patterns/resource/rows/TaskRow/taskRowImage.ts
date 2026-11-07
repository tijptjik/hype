// ENUMS
import { ImageContextResource } from '#lib/enums.js'
// TYPES
import type { Task } from '#lib/db/zod/schema/task.types.js'

/**
 * Preserves the Feature context needed to authorize a task's pinned thumbnail.
 * @param task Task with its retained image attachments and optional Feature identity.
 * @returns First attachment with Feature context, or no image when unattached.
 * @remarks Proposal-only tasks keep context-free revision delivery under task authorization.
 */
export function taskRowImage(task: Pick<Task, 'images' | 'featureId'>):
  | (NonNullable<Task['images']>[number] & {
      ctxType?: ImageContextResource.feature
      ctxId?: string
    })
  | undefined {
  const attachment = task.images?.[0]
  if (!attachment?.image) return undefined
  return {
    ...attachment,
    ...(task.featureId
      ? { ctxType: ImageContextResource.feature, ctxId: task.featureId }
      : {}),
  }
}
