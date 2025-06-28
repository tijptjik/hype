<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// TYPES
import type { Feature, UserContributedFeature } from '$lib/types';

// STATE : PROPS
let { feature }: { feature: Feature | UserContributedFeature } = $props();

// CONTEXT
const appCtx = getAppCtx();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// STATE : LOCAL
let description = $derived(
  getI18n(
    feature as Feature,
    'description',
    userPreferences,
    m.zany_merry_seahorse_treasure()
  )
);
let hasMoreBelow = $state(false);
let scrollContainer: HTMLElement = $state()!;

// ═══════════════════════
// 2.1 SCROLL :: DETECTION
// ═══════════════════════

// Action to detect if there's more content below the current scroll position
function smartScroll(node: HTMLElement) {
  function updateScrollState() {
    // Wait for next frame to ensure accurate measurements
    requestAnimationFrame(() => {
      const scrollTop = node.scrollTop;
      const clientHeight = node.clientHeight;
      const scrollHeight = node.scrollHeight;

      // Check if content is scrollable at all
      const isScrollable = scrollHeight > clientHeight;

      // More generous tolerance for bottom detection (accounts for sub-pixel rendering)
      const scrollBottom = scrollTop + clientHeight;
      const isAtBottom = scrollBottom >= scrollHeight - 5; // 5px tolerance

      // Only show gradient if content is scrollable AND we're not at the bottom
      hasMoreBelow = isScrollable && !isAtBottom;
    });
  }

  // Check immediately and whenever content changes
  updateScrollState();

  // Listen to scroll events to update the gradient visibility
  node.addEventListener('scroll', updateScrollState, { passive: true });

  // Use ResizeObserver to detect content changes
  const resizeObserver = new ResizeObserver(updateScrollState);
  resizeObserver.observe(node);

  // Also check when the node's children change
  const mutationObserver = new MutationObserver(updateScrollState);
  mutationObserver.observe(node, {
    childList: true,
    subtree: true,
    characterData: true
  });

  return {
    destroy() {
      node.removeEventListener('scroll', updateScrollState);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    }
  };
}

// Reset scroll position when description changes (new feature loaded)
$effect(() => {
  description; // track changes
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }
});
</script>

{#if description !== m.zany_merry_seahorse_treasure() && description.length > 0 && description !== '-'}
  <div
    class="flex-shrink-3 pointer-events-auto relative z-10 my-0 flex min-h-12 select-none flex-col bg-black caret-transparent">
    <div class="overflow-y-auto" bind:this={scrollContainer} use:smartScroll>
      <div class="h-auto min-h-8 w-100:pl-6 w-100:pr-4">
        <p
          class="m-0 overflow-visible p-0 text-sm font-thin leading-tight tracking-tight text-gray-300">
          {@html description.replaceAll('\n', '<br />')}
        </p>
      </div>
    </div>
    {#if hasMoreBelow}
      <div
        class="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black to-transparent"
        transition:fade={{ duration: 200 }}>
      </div>
    {/if}
  </div>
{/if}
