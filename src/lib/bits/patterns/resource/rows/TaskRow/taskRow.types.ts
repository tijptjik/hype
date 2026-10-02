import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'

export type TaskRowProps = {
  adminCtx: AdminCtx
  entity: Task
  index: number
  onImageClick?: (image: ImageCtxEnvelope, task: Task) => void
  isSelected?: boolean
}
