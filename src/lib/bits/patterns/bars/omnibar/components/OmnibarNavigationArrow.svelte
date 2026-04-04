<script lang="ts">
// BITS
import { Icon } from '$lib/bits'
// ICONS
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
// TYPES
import type { OmnibarNavigationArrowProps } from './omnibarPrimitives.types'

let { direction, disabled = false, onClick }: OmnibarNavigationArrowProps = $props()
</script>

<button
  type="button"
  class="group flex h-full w-12 flex-none touch-none items-center justify-center rounded-none bg-black transition-colors duration-300 focus:outline-none {direction === 'right'
    ? 'w-140:rounded-r-md'
    : 'w-140:rounded-l-md'}"
  {disabled}
  onclick={onClick}
>
  <Icon
    src={direction === 'left' ? ChevronLeft : ChevronRight}
    class="h-5 w-5 transition-opacity duration-200 group-hover:text-neutral-content {disabled
      ? 'opacity-50'
      : ''}"
  />
</button>
