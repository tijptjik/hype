<script lang="ts">
// SVELTE
import { setContext } from 'svelte'
// COMPONENTS
import Attribution from '#lib/bits/patterns/cards/featureCard/components/images/FeatureCardViewerAttribution.svelte'
// TYPES
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types'
import type { useImageEditorGalleryModel } from '#lib/adapters/image/index'

setContext(Symbol.for('hype.context.resource-view'), {
  isAdmin: () => false,
  cache: { feature: { get: () => ({ createdAt: '2020-01-01' }) } },
})
let target = $state<HTMLDivElement | null>(null)
let height = $state(0)
const image = {
  ctxType: 'feature', ctxId: 'fixture',
  image: { id: 'fixture', attribution: 'Photographer with a long attribution that wraps across several lines on a narrow phone screen' },
} as ImageCtxEnvelope
const gallery = {
  state: {
    activeId: 'fixture', isMetadataLoading: false,
    metadata: { cameraModel: 'A camera with a long model name', originalWidth: 5000, originalHeight: 3000, credit: 'Extended embedded credit '.repeat(30) },
  },
  actions: { ensureMetadataLoaded: async () => {} },
} as unknown as ReturnType<typeof useImageEditorGalleryModel>
</script>

<div data-theme="hype-dark" class="bits-theme mx-auto max-w-96 bg-panel p-2 text-foreground">
  <div data-viewer bind:this={target} class="relative rounded-xl bg-base-200" style:min-height={`${Math.max(320, height)}px`}>
    <div class="absolute bottom-3 left-3">
      <Attribution currentImage={image} {gallery} overlayTarget={target} onHeightChange={value => { height = value }} />
    </div>
  </div>
  <div data-body class="p-4">Card body follows the attribution content.</div>
</div>
