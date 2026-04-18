<script lang="ts">
// ADAPTERS
import { useImageEditorGalleryModel } from '$lib/adapters/image'
// BITS
import { ThumbnailWrapper } from '$lib/bits'
import { getImageCtx } from '$lib/context/image.svelte'
import type { Snippet } from 'svelte'
import type { TaskFooterProps } from '../task.types'

let {
  class: className = '',
  readonly = false,
  children,
}: TaskFooterProps & { children?: Snippet } = $props()

const model = useImageEditorGalleryModel(getImageCtx())
</script>

<section class={['bg-black', className].filter(Boolean).join(' ')}>
  <ThumbnailWrapper
    items={model.state.items}
    activeId={model.state.activeId}
    variant="admin"
    orientation="horizontal"
    class="h-57 pr-3"
    size={192}
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
