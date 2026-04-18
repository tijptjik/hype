import type { AdminCtx } from '$lib/context/admin.svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Task } from '$lib/types'

export type TaskRowProps = {
  adminCtx: AdminCtx
  entity: Task
  index: number
  onImageClick?: (image: ImageCtxEnvelope, task: Task) => void
  isSelected?: boolean
}
