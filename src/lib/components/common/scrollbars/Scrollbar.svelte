<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// SVROLLBAR
import { Svrollbar } from 'svrollbar';
import VirtualSvrollbar from './VirtualScrollbar.svelte';
// BROWSER
import { BROWSER } from 'esm-env';

let {
  viewport,
  contents,
  virtual = false,
  debug = false,
  // Virtual scrollbar specific props
  viewportHeight = 0,
  contentsHeight = 0,
  scrollTop = 0,
  showThumbOnTrackEnter = false,
  width = {
    track: 10,
    thumb: 8,
    thumbActive: 12
  },
  ...restProps
} = $props<{
  viewport?: HTMLElement;
  contents?: HTMLElement;
  virtual?: boolean;
  alwaysVisible?: boolean;
  debug?: boolean;
  // Virtual scrollbar specific props
  viewportHeight?: number;
  contentsHeight?: number;
  scrollTop?: number;
  showThumbOnTrackEnter?: boolean;
  hideAfter?: number;
  initiallyVisible?: boolean;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  width?: { track?: number; thumb?: number; thumbActive?: number };
  opacity?: { track?: number; thumb?: number; thumbActive?: number };
  vTrackIn?: (node: HTMLElement) => any;
  vTrackOut?: (node: HTMLElement) => any;
  vThumbIn?: (node: HTMLElement) => any;
  vThumbOut?: (node: HTMLElement) => any;
  onshow?: () => void;
  onhide?: () => void;
}>();

let svrollbarElement: HTMLElement;
let isScrolling = $state(false);
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

// Add body class management for preventing text selection during scrollbar interaction
const addScrollingClass = () => {
  if (BROWSER && !isScrolling) {
    isScrolling = true;
    document.body.classList.add('svrollbar-scrolling');

    if (debug) {
      console.log('SafeSvrollbar: Added scrolling class to body');
    }

    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
  }
};

const removeScrollingClass = () => {
  if (BROWSER) {
    // Clear existing timeout
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    // Set timeout to remove class after scrolling stops
    scrollTimeout = setTimeout(() => {
      isScrolling = false;
      document.body.classList.remove('svrollbar-scrolling');

      if (debug) {
        console.log('SafeSvrollbar: Removed scrolling class from body');
      }
    }, 150); // 150ms delay after scrolling stops
  }
};

onMount(() => {
  if (BROWSER && svrollbarElement) {
    // Add data attribute for CSS targeting
    svrollbarElement.setAttribute('data-svrollbar', 'true');

    if (debug) {
      console.log('SafeSvrollbar: Mounted and configured');
    }

    // Listen for mouse events on the scrollbar and its children
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if the click is on the scrollbar or any of its children
      if (
        target &&
        (target.closest('[data-svrollbar]') ||
          target.hasAttribute('data-svrollbar') ||
          target.closest('.svrollbar') ||
          target.classList.contains('svrollbar'))
      ) {
        if (debug) {
          console.log('SafeSvrollbar: Mouse down on scrollbar detected');
        }
        addScrollingClass();
      }
    };

    const handleMouseUp = () => {
      if (isScrolling) {
        if (debug) {
          console.log('SafeSvrollbar: Mouse up detected, removing scrolling class');
        }
        removeScrollingClass();
      }
    };

    const handleMouseLeave = () => {
      if (isScrolling) {
        if (debug) {
          console.log('SafeSvrollbar: Mouse leave detected, removing scrolling class');
        }
        removeScrollingClass();
      }
    };

    // Listen for scroll events on the viewport
    const handleScroll = () => {
      if (debug) {
        console.log('SafeSvrollbar: Scroll event detected');
      }
      addScrollingClass();
      removeScrollingClass(); // This will set the timeout
    };

    // Listen for drag events that might be triggered by scrollbar interaction
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest('[data-svrollbar]')) {
        if (debug) {
          console.log('SafeSvrollbar: Preventing drag start on scrollbar');
        }
        e.preventDefault();
        e.stopPropagation();
        addScrollingClass();
      }
    };

    // Add event listeners
    svrollbarElement.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('dragstart', handleDragStart, true);

    if (viewport) {
      viewport.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      // Cleanup
      svrollbarElement?.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('dragstart', handleDragStart, true);

      if (viewport) {
        viewport.removeEventListener('scroll', handleScroll);
      }

      // Clear timeout and remove class
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      document.body.classList.remove('svrollbar-scrolling');

      if (debug) {
        console.log('SafeSvrollbar: Cleaned up and removed body class');
      }
    };
  }
});
</script>

<div bind:this={svrollbarElement} data-svrollbar="true" class="svrollbar-wrapper">
  {#if virtual}
    <VirtualSvrollbar
      {viewportHeight}
      {contentsHeight}
      {scrollTop}
      {showThumbOnTrackEnter}
      {debug}
      {width}
      {...restProps} />
  {:else}
    <Svrollbar {viewport} {contents} {debug} {...restProps} />
  {/if}
</div>
