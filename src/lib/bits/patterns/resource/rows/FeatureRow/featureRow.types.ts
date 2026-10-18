import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureRowModel } from '#lib/client/services/featureRows.types.js'
import type { ResourceIndexRowSelectionState } from '#lib/client/services/bulkEdit.types.js'

export type FeatureRowProps = {
  adminCtx: AdminCtx
  entity: Feature
  model: FeatureRowModel
  index: number
  onImageClick?: (image: ImageCtxEnvelope, feature: Feature) => void
  isSelected?: boolean
  selectionState?: ResourceIndexRowSelectionState | null
  isFocusable?: boolean
}
