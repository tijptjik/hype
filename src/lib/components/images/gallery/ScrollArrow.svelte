<script lang="ts">
import { fade } from 'svelte/transition';
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronLeft, ChevronRight } from '@steeze-ui/heroicons';

type Props = {
  direction: 'left' | 'right';
  onClick?: (e: MouseEvent) => void;
  onScroll?: (direction: 'left' | 'right') => void;
};

let { direction, onClick, onScroll }: Props = $props();

function handleClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
  
  if (onClick) {
    onClick(e);
  } else if (onScroll) {
    onScroll(direction);
  }
}
</script>

<button
  class="arrow absolute {direction === 'left' ? 'left-6' : 'right-6'} top-1/2 z-40 -translate-y-1/2 transform rounded-full bg-base-100/80 p-2 shadow-lg backdrop-blur-sm transition-all hover:bg-base-100 hover:shadow-xl hover:scale-110"
  onclick={handleClick}
  in:fade={{ duration: 200 }}
  out:fade={{ duration: 200 }}>
  <Icon src={direction === 'left' ? ChevronLeft : ChevronRight} class="h-5 w-5" />
</button>

<style>
/* Ensure arrows are clickable but don't interfere with content */
button.arrow {
  backdrop-filter: blur(4px);
}

/* Optional: Add hover effect for arrows */
button.arrow:hover {
  transform: translateY(-50%) scale(1.1);
}
</style>

