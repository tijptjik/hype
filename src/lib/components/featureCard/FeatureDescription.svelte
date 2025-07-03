<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import Scrollbar from '$lib/components/common/scrollbars/Scrollbar.svelte';
import Toggle from '$lib/components/featureCard/elements/DescriptionToggleButton.svelte';
// TYPES
import type { Feature, UserContributedFeature } from '$lib/types';

// STATE : PROPS
let {
  feature,
  expanded = false,
  onToggle,
  availableHeight = 400,
  minOverflowedHeight = 68,
  descriptionElement = $bindable()
}: {
  feature: Feature | UserContributedFeature;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  availableHeight?: number;
  minOverflowedHeight?: number;
  descriptionElement?: HTMLDivElement;
} = $props();

// CONTEXT
const appCtx = getAppCtx();

// STATE : SESSION
const userPreferences = $derived(appCtx.getUserPreferences());

// ELEMENTS
let scrollContainer: HTMLElement = $state()!;
let contentsElement: HTMLElement = $state()!;

// STATE : Overflow
let hasMoreBelow = $state(false);
let hasOverflow = $state(false);
let hasCollapsedOverflow = $state(false); // Track if content overflows in collapsed state

// STATE : LOCAL
let description = $derived(
  getI18n(
    feature as Feature,
    'description',
    userPreferences,
    m.zany_merry_seahorse_treasure()
  )
);

// ═══════════════════════
// 2.1 SCROLL :: DETECTION
// ═══════════════════════

// Centralized overflow detection logic
function updateOverflowState() {
  if (!contentsElement) return;

  const contentHeight = contentsElement.scrollHeight;
  const containerHeight = expanded ? availableHeight : minOverflowedHeight;

  hasCollapsedOverflow = contentHeight > minOverflowedHeight;
  hasOverflow = contentHeight > containerHeight;
}

// Action to detect if there's more content below the current scroll position
function smartScroll(node: HTMLElement) {
  function updateScrollState() {
    // Wait for next frame to ensure accurate measurements
    requestAnimationFrame(() => {
      updateOverflowState();

      if (expanded) {
        const scrollTop = node.scrollTop;
        const clientHeight = node.clientHeight;
        const scrollHeight = node.scrollHeight;

        // More generous tolerance for bottom detection (accounts for sub-pixel rendering)
        const scrollBottom = scrollTop + clientHeight;
        const isAtBottom = scrollBottom >= scrollHeight - 5; // 5px tolerance

        // Only show gradient if content is scrollable AND we're not at the bottom
        hasMoreBelow = scrollHeight > clientHeight && !isAtBottom;
      } else {
        hasMoreBelow = false;
      }
    });
  }

  // Check immediately and whenever content changes
  updateScrollState();

  // Listen to scroll events to update the gradient visibility
  node.addEventListener('scroll', updateScrollState, { passive: true });

  // Use ResizeObserver to detect content changes
  const resizeObserver = new ResizeObserver(updateScrollState);
  resizeObserver.observe(node);

  // Also observe the content element
  if (contentsElement) {
    resizeObserver.observe(contentsElement);
  }

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

// Reset scroll position and recheck overflow when description changes
$effect(() => {
  description; // track changes
  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
    // Recheck overflow after description changes
    requestAnimationFrame(() => {
      updateOverflowState();
    });
  }
});

// Recheck overflow when expanded state changes
$effect(() => {
  expanded; // track changes
  if (scrollContainer && contentsElement) {
    requestAnimationFrame(() => {
      updateOverflowState();
    });
  }
});

// ═══════════════════════
// 2.2 TOGGLE :: HANDLER
// ═══════════════════════

function handleToggle() {
  onToggle?.(!expanded);
}
</script>

{#if description !== m.zany_merry_seahorse_treasure() && description.length > 0 && description !== '-'}
  <div
    bind:this={descriptionElement}
    class="pointer-events-auto relative z-10 my-0 flex-shrink-0 bg-black caret-transparent transition-all duration-300 ease-in-out"
    style="height: {!hasOverflow && !expanded
      ? 'inherit'
      : expanded
        ? `${availableHeight}px`
        : `${minOverflowedHeight}px`}; overflow: hidden;">
    <div class="relative h-full">
      <div class="h-full overflow-y-auto" bind:this={scrollContainer} use:smartScroll>
        <div class="px-3 py-1 w-100:px-6">
          <p
            bind:this={contentsElement}
            class="m-0 p-0 text-[0.9375rem] font-thin leading-tight tracking-tight text-gray-300"
            style="line-height: 1.5;">
            {@html description.replaceAll('\n', '<br />')}
          </p>
        </div>
      </div>
      {#if expanded}
        <Scrollbar
          viewport={scrollContainer}
          contents={contentsElement}
          alwaysVisible={false}
          margin={{ right: 2 }}
          width={{ track: 6, thumb: 4, thumbActive: 6 }}
          opacity={{ track: 0.3, thumb: 0.6, thumbActive: 0.8 }} />
      {/if}

      {#if hasOverflow && !expanded}
        <div
          class="pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black to-transparent">
        </div>
      {/if}
      <Toggle {hasCollapsedOverflow} {expanded} {handleToggle} />
    </div>
  </div>
{/if}
