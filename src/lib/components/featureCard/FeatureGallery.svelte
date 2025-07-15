<script lang="ts">
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// COMPONENTS
import Carousel from './gallery/Carousel.svelte';
// CONTEXT
import { getCardCtx } from '$lib/context/card.svelte';
// CONTEXT
const cardCtx = getCardCtx();
</script>

<div
  class="pointer-events-auto relative flex aspect-square w-full flex-grow items-center justify-center overflow-hidden bg-base-content/20 caret-transparent backdrop-blur-sm transition-all duration-300 {cardCtx
    .state.mode === FeatureCardMode.Display
    ? 'min-h-56 flex-shrink'
    : 'min-h-64 flex-shrink-0'}">
  <Carousel />
</div>
