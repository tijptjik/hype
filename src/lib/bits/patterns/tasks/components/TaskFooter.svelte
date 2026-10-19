<script lang="ts">
// ADAPTERS
import { useImageEditorGalleryModel } from '#lib/adapters/image/index.js'
// BITS
import { ThumbnailWrapper } from '#lib/bits/index.js'
import { getImageCtx } from '#lib/context/image.svelte.js'
import type { Snippet } from 'svelte'
import type { TaskFooterProps } from '../task.types'

let {
  class: className = '',
  readonly = false,
  children,
}: TaskFooterProps & { children?: Snippet } = $props()

const model = useImageEditorGalleryModel(getImageCtx())
</script>

<section
  class={['shrink-0 border-t border-border bg-panel p-3', className]
    .filter(Boolean)
    .join(' ')}
>
  <ThumbnailWrapper
    items={model.state.items}
    activeId={model.state.activeId}
    variant="admin"
    orientation="horizontal"
    class="h-28"
    trackClass="m-0 bg-transparent p-0"
    size={112}
    fit="fit"
    getIsLoading={model.status.isLoading}
    getIsUploading={model.status.isUploading}
    isIntentDisabled={readonly}
    onIntentChange={model.actions.setIntent}
    onDelete={readonly ? undefined : model.actions.deleteItem}
    onRetryUpload={model.actions.retryUpload}
    onLoad={model.actions.markThumbnailLoaded}
    onError={model.actions.markThumbnailErrored}
    onSelect={item => {
      model.actions.select(item.id)
    }}
    onHover={item => {
      model.actions.select(item.id)
    }}
  />

  {@render children?.()}
</section>
