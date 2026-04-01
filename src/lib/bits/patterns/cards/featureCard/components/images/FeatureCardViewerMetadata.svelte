<script lang="ts">
import FeatureCardViewerAttribution from './FeatureCardViewerAttribution.svelte'
import FeatureCardViewerIntent from './FeatureCardViewerIntent.svelte'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'

let { currentImage }: { currentImage: ImageCtxEnvelope } = $props()
</script>

<div
  class="flex select-none flex-row items-end gap-2 overflow-visible caret-transparent"
>
  <FeatureCardViewerAttribution {currentImage} />
  <FeatureCardViewerIntent {currentImage} />
</div>
