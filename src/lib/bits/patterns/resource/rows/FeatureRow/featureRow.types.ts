import type { AdminCtx } from '$lib/context/admin.svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { FeatureRowModel } from '$lib/types'

export type FeatureRowProps = {
  adminCtx: AdminCtx
  entity: Feature
  model: FeatureRowModel
  index: number
  onImageClick?: (image: ImageCtxEnvelope, feature: Feature) => void
  isSelected?: boolean
}
