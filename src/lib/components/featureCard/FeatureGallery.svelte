<script lang="ts">
// ENUMS
import { FeatureCardMode } from '$lib/enums'
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte'
import { getImageCtx } from '$lib/context/image.svelte'
// COMPONENTS
import AddPhotoPrompt from '$lib/components/featureCard/gallery/AddPhotoPrompt.svelte'
import SelectPhotoSource from '$lib/components/featureCard/gallery/SelectPhotoSource.svelte'
import SuccesfulSubmission from '$lib/components/featureCard/gallery/SuccesfulSubmission.svelte'
import Carousel from './gallery/Carousel.svelte'
// TYPES
import type { Image } from '$lib/types'

// CONTEXT
const imageCtx = getImageCtx()
const cardCtx = getCardCtx()

// SERVICES
let images: Image[] = $derived(imageCtx.getImages())
</script>

<div
  class="pointer-events-auto relative flex min-h-[220px] w-full flex-1 items-center justify-center overflow-hidden bg-base-content/20 caret-transparent backdrop-blur-sm transition-all duration-300 w-112:min-h-[280px]"
>
  {#if images.length == 0}
    {#if cardCtx.isDisplayMode}
      <AddPhotoPrompt />
    {:else if cardCtx.isSubmissionSuccessMode}
      <SuccesfulSubmission />
    {:else if cardCtx.isAddPhotoMode || cardCtx.isNewMode || cardCtx.isMissingMode}
      <SelectPhotoSource />
    {/if}
  {:else}
    <Carousel />
  {/if}
</div>
