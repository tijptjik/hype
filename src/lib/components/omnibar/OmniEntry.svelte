<script lang="ts">
// TYPES
import type { SearchResult } from '$lib/types';

// TYPES
type Props = {
  result: SearchResult;
  onSelection?: (ref: string) => void;
};

let { result, onSelection }: Props = $props();

let handleClick = (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (onSelection) {
    onSelection(result.ref);
  }
};

let handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    if (onSelection) {
      onSelection(result.ref);
    }
  }
};
</script>

<div
  class="flex items-center gap-2 px-4 pr-3 py-2 text-sm hover:bg-base-200 flex-shrink-0 outline-none focus:bg-base-200 select-none cursor-pointer"
  tabindex="0"
  role="option"
  onclick={handleClick}
  onkeydown={handleKeyDown}>
  <div class="h-1.5 w-1.5 rounded-full bg-base-content/60 select-none "></div>
  <span class="flex-grow">{result.name}</span>
  {#if result.count > 0 && result.group !== 'features'}
    <span class="text-base-content/60 font-mono w-6 text-center select-none">{result.count}</span>
  {/if}
</div>
