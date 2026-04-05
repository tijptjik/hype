<script lang="ts">
import type { ImageProviderModel } from '$lib/types'
import FeatureCardViewerContent from './components/FeatureCardViewerContent.svelte'
import * as ViewerPrimitive from './components/images'

let { model }: { model: ImageProviderModel } = $props()
</script>

<ViewerPrimitive.Root {model}> <FeatureCardViewerContent /> </ViewerPrimitive.Root>
