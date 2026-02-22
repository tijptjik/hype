<script lang="ts">
import ResourceThumbnail from './ResourceThumbnail.svelte'
import ResourceTitle from './ResourceTitle.svelte'
import ResourceDescription from './ResourceDescription.svelte'
import type { ImageContextEnvelope, ImageCtxEnvelope } from '$lib/types'

let {
  image,
  alt = 'Resource image',
  onImageClick,
  title,
  onTitleClick,
  description,
  onDescriptionClick,
}: {
  image?: ImageContextEnvelope | ImageCtxEnvelope | null
  alt?: string
  onImageClick?: (image: ImageContextEnvelope | ImageCtxEnvelope) => void
  title: string
  onTitleClick?: () => void
  description: string
  onDescriptionClick?: () => void
} = $props()
</script>

<div class="flex items-center gap-4">
  <ResourceThumbnail {image} {alt} onClick={onImageClick} />
  <div class="flex flex-col overflow-hidden pt-1">
    <ResourceTitle text={title} onClick={onTitleClick} />
    <ResourceDescription text={description} onClick={onDescriptionClick} />
  </div>
</div>
