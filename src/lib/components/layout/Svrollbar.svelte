<script lang="ts">
// SVELTE
import { fade } from 'svelte/transition';
import { onDestroy, onMount } from 'svelte';

let {
  viewport = $bindable<Element>(),
  contents = $bindable<Element>(),
  hideAfter = 1000,
  alwaysVisible = false,
  initiallyVisible = false,
  showThumbOnTrackEnter = false,
  margin = {} as { top?: number; right?: number; bottom?: number; left?: number },
  width = {
    track: 10,
    thumb: 8,
    thumbActive: 12
  } as { track?: number; thumb?: number; thumbActive?: number },
  opacity = {
    track: 1,
    thumb: 0.5,
    thumbActive: 0.8
  } as { track?: number; thumb?: number; thumbActive?: number },
  vTrackIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vTrackOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  vThumbIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vThumbOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  onshow = undefined as (() => void) | undefined,
  onhide = undefined as (() => void) | undefined,
  debug = false
} = $props();

// ═══════════════════════
// 2. STATE
// ═══════════════════════

let vTrack = $state<HTMLDivElement>();
let vThumb = $state<HTMLDivElement>();
let startTop = $state(0);
let startY = $state(0);
let timer = $state(0);
let trackHoverTimer = $state(0);
let windowScrollEnabled = $state(false);
let interacted = $state(false);
let trackHovered = $state(false);
let thumbHovered = $state(false);
let thumbDragging = $state(false);

let wholeHeight = $state(0);
let scrollTop = $state(0);
let trackHeight = $state(0);
let thumbHeight = $state(0);
let thumbTop = $state(0);

let teardownViewport = $state<(() => void) | undefined>();
let teardownContents = $state<(() => void) | undefined>();
let teardownTrack = $state<(() => void) | undefined>();
let teardownThumb = $state<(() => void) | undefined>();

// Non-reactive calculations to avoid infinite loops
let isScrollable = $state(false);
let isVisible = $state(false);

// The actual element that handles scrolling (might be different from viewport)
let actualScrollElement = $state<Element | undefined>();

// ═══════════════════════
// 3. DERIVED VALUES
// ═══════════════════════

const marginTop = $derived(margin.top ?? 0);
const marginBottom = $derived(margin.bottom ?? 0);
const marginRight = $derived(margin.right ?? 0);
const marginLeft = $derived(margin.left ?? 0);

// ═══════════════════════
// 4. SETUP FUNCTIONS
// ═══════════════════════

// Update measurements only when needed, not in a reactive loop
function updateMeasurements() {
  if (!viewport || !actualScrollElement) return;

  // Use actualScrollElement for scroll measurements, viewport for sizing
  const newWholeHeight = actualScrollElement.scrollHeight;
  const newScrollTop = actualScrollElement.scrollTop;
  const newTrackHeight = viewport.clientHeight - (marginTop + marginBottom);
  const newThumbHeight =
    newWholeHeight > 0 ? (newTrackHeight / newWholeHeight) * newTrackHeight : 0;
  const newThumbTop =
    newWholeHeight > 0 ? (newScrollTop / newWholeHeight) * newTrackHeight : 0;
  const newScrollable = newWholeHeight > newTrackHeight;
  const newVisible =
    newScrollable &&
    (alwaysVisible ||
      initiallyVisible ||
      (showThumbOnTrackEnter && trackHovered) ||
      interacted);

  // Only update state if values actually changed
  if (wholeHeight !== newWholeHeight) wholeHeight = newWholeHeight;
  if (scrollTop !== newScrollTop) scrollTop = newScrollTop;
  if (trackHeight !== newTrackHeight) trackHeight = newTrackHeight;
  if (thumbHeight !== newThumbHeight) thumbHeight = newThumbHeight;
  if (thumbTop !== newThumbTop) thumbTop = newThumbTop;
  if (isScrollable !== newScrollable) isScrollable = newScrollable;
  if (isVisible !== newVisible) isVisible = newVisible;

  if (debug) {
    console.log('Measurements updated:', {
      wholeHeight,
      scrollTop,
      trackHeight,
      thumbHeight,
      thumbTop,
      isScrollable,
      isVisible,
      viewportClientHeight: viewport.clientHeight,
      actualScrollHeight: actualScrollElement.scrollHeight,
      actualScrollTop: actualScrollElement.scrollTop
    });
  }
}

function setupAll() {
  if (debug) console.log('Setting up all components');

  if (viewport) {
    teardownViewport?.();
    teardownViewport = setupViewport(viewport);
  }

  if (contents) {
    teardownContents?.();
    teardownContents = setupContents(contents);
  }

  if (vTrack) {
    teardownTrack?.();
    teardownTrack = setupTrack(vTrack);
  }

  if (vThumb) {
    teardownThumb?.();
    teardownThumb = setupThumb(vThumb);
  }
}

function setupViewport(viewport: Element) {
  if (!viewport) {
    if (debug) console.log('setupViewport: No viewport provided');
    return;
  }

  if (debug) {
    console.log('setupViewport: Starting setup', {
      viewport,
      tagName: viewport.tagName,
      id: viewport.id,
      className: viewport.className,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      scrollTop: viewport.scrollTop,
      overflowY: getComputedStyle(viewport).overflowY,
      overflowX: getComputedStyle(viewport).overflowX
    });
  }

  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.');
  }

  windowScrollEnabled = document.scrollingElement === viewport;
  if (debug) console.log('setupViewport: windowScrollEnabled =', windowScrollEnabled);

  // Find the actual scrollable element
  let scrollableElement = viewport;
  const computedStyle = getComputedStyle(viewport);

  // If viewport has overflow:hidden, look for a scrollable child
  if (computedStyle.overflowY === 'hidden' || computedStyle.overflow === 'hidden') {
    if (debug)
      console.log('Viewport has overflow:hidden, looking for scrollable child...');

    // First, always try the contents element if provided
    if (contents && contents !== viewport) {
      const contentsStyle = getComputedStyle(contents);
      if (debug)
        console.log('Checking contents element:', {
          element: contents,
          tagName: contents.tagName,
          className: contents.className,
          overflowY: contentsStyle.overflowY,
          overflow: contentsStyle.overflow,
          scrollHeight: contents.scrollHeight,
          clientHeight: contents.clientHeight,
          canScroll: contents.scrollHeight > contents.clientHeight
        });

      // Use contents if it can scroll, regardless of CSS overflow setting
      if (contents.scrollHeight > contents.clientHeight) {
        scrollableElement = contents;
        if (debug)
          console.log(
            '✅ Using contents as scrollable element (has scrollable content)'
          );
      }
    }

    // If contents didn't work, look through children
    if (scrollableElement === viewport) {
      const children = viewport.children;
      if (debug)
        console.log(`Searching ${children.length} children for scrollable elements...`);

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const childStyle = getComputedStyle(child);
        const canScroll = child.scrollHeight > child.clientHeight;

        if (debug)
          console.log(`Child ${i}:`, {
            tagName: child.tagName,
            className: child.className,
            overflowY: childStyle.overflowY,
            overflow: childStyle.overflow,
            scrollHeight: child.scrollHeight,
            clientHeight: child.clientHeight,
            canScroll
          });

        if (canScroll) {
          scrollableElement = child;
          if (debug) console.log(`✅ Found scrollable child ${i}:`, child);
          break;
        }
      }
    }
  }

  if (debug) {
    console.log('Final scrollable element:', {
      element: scrollableElement,
      tagName: scrollableElement.tagName,
      className: scrollableElement.className,
      overflowY: getComputedStyle(scrollableElement).overflowY,
      scrollHeight: scrollableElement.scrollHeight,
      clientHeight: scrollableElement.clientHeight,
      scrollTop: scrollableElement.scrollTop
    });
  }

  // If we found a proper scrollable element, use it
  if (scrollableElement !== viewport) {
    scrollableElement.addEventListener('scroll', onScroll, { passive: true });
    if (debug)
      console.log('setupViewport: Scroll listener added to', scrollableElement.tagName);
  } else {
    // Fallback: listen to multiple possible scroll sources
    if (debug)
      console.log(
        '🔄 No explicit scrollable element found, using fallback scroll detection'
      );

    // Try the viewport itself
    viewport.addEventListener('scroll', onScroll, { passive: true });

    // Also try document scroll (for cases where browser handles scrolling)
    document.addEventListener('scroll', onScroll, { passive: true });

    // And try contents element if it exists
    if (contents && contents !== viewport) {
      contents.addEventListener('scroll', onScroll, { passive: true });
    }

    if (debug) {
      console.log('Added scroll listeners to: viewport, document, and contents');

      // Add test listeners to ALL possible scroll sources
      const testViewport = () => console.log('🎯 SCROLL on VIEWPORT');
      const testDocument = () => console.log('🎯 SCROLL on DOCUMENT');
      const testContents = () => console.log('🎯 SCROLL on CONTENTS');
      const testWindow = () => console.log('🎯 SCROLL on WINDOW');

      viewport.addEventListener('scroll', testViewport, { passive: true });
      document.addEventListener('scroll', testDocument, { passive: true });
      window.addEventListener('scroll', testWindow, { passive: true });
      if (contents)
        contents.addEventListener('scroll', testContents, { passive: true });

      // Check for scroll interference
      console.log('🔍 CHECKING FOR SCROLL INTERFERENCE:');

      // Check if elements can actually be scrolled programmatically
      const testScroll = () => {
        const originalViewportScroll = viewport.scrollTop;
        const originalDocumentScroll = document.documentElement.scrollTop;
        const originalWindowScroll = window.scrollY;

        // Try to scroll each element programmatically
        try {
          viewport.scrollTop = viewport.scrollTop + 1;
          console.log('✅ Viewport can be scrolled programmatically', {
            before: originalViewportScroll,
            after: viewport.scrollTop
          });
        } catch (e) {
          console.log('❌ Viewport cannot be scrolled programmatically', e);
        }

        try {
          document.documentElement.scrollTop = document.documentElement.scrollTop + 1;
          console.log('✅ Document can be scrolled programmatically', {
            before: originalDocumentScroll,
            after: document.documentElement.scrollTop
          });
        } catch (e) {
          console.log('❌ Document cannot be scrolled programmatically', e);
        }

        try {
          window.scrollTo(0, window.scrollY + 1);
          console.log('✅ Window can be scrolled programmatically', {
            before: originalWindowScroll,
            after: window.scrollY
          });
        } catch (e) {
          console.log('❌ Window cannot be scrolled programmatically', e);
        }

        // Check for event listener interference
        const eventListeners = (window as any).getEventListeners
          ? (window as any).getEventListeners(viewport)
          : 'getEventListeners not available';
        console.log('🎧 Event listeners on viewport:', eventListeners);

        // Check computed styles that might prevent scrolling
        const viewportStyle = getComputedStyle(viewport);
        console.log('🎨 Viewport scroll-affecting styles:', {
          overflow: viewportStyle.overflow,
          overflowX: viewportStyle.overflowX,
          overflowY: viewportStyle.overflowY,
          height: viewportStyle.height,
          maxHeight: viewportStyle.maxHeight,
          position: viewportStyle.position,
          touchAction: viewportStyle.touchAction,
          userSelect: viewportStyle.userSelect,
          pointerEvents: viewportStyle.pointerEvents
        });
      };

      setTimeout(testScroll, 1000);

      // ULTIMATE TEST: Use polling to detect scroll changes
      let lastScrollTop = actualScrollElement?.scrollTop ?? 0;
      let lastViewportScrollTop = viewport.scrollTop;
      let lastDocumentScrollTop = document.documentElement.scrollTop;
      let lastWindowScrollY = window.scrollY;

      const pollForScroll = () => {
        const currentScrollTop = actualScrollElement?.scrollTop ?? 0;
        const currentViewportScrollTop = viewport.scrollTop;
        const currentDocumentScrollTop = document.documentElement.scrollTop;
        const currentWindowScrollY = window.scrollY;

        // Also check all parent elements for scroll changes
        let parent = viewport.parentElement;
        let parentScrollDetected = false;
        while (parent && parent !== document.body) {
          const parentScrollTop = parent.scrollTop;
          if (parentScrollTop > 0) {
            console.log('🚨 FOUND PARENT ELEMENT WITH SCROLL!', {
              element: parent,
              tagName: parent.tagName,
              className: parent.className,
              scrollTop: parentScrollTop,
              scrollHeight: parent.scrollHeight,
              clientHeight: parent.clientHeight
            });
            parentScrollDetected = true;
            // Add listener to this parent
            const parentListener = () =>
              console.log('🎯 PARENT SCROLL EVENT!', parent?.tagName);
            parent?.addEventListener('scroll', parentListener, { passive: true });
            setTimeout(
              () => parent?.removeEventListener('scroll', parentListener),
              5000
            );
          }
          parent = parent.parentElement;
        }

        if (currentScrollTop !== lastScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on actualScrollElement!', {
            from: lastScrollTop,
            to: currentScrollTop
          });
          lastScrollTop = currentScrollTop;
          onScroll(); // Manually trigger our scroll handler
        }
        if (currentViewportScrollTop !== lastViewportScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on viewport!', {
            from: lastViewportScrollTop,
            to: currentViewportScrollTop
          });
          lastViewportScrollTop = currentViewportScrollTop;
          onScroll();
        }
        if (currentDocumentScrollTop !== lastDocumentScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on document!', {
            from: lastDocumentScrollTop,
            to: currentDocumentScrollTop
          });
          lastDocumentScrollTop = currentDocumentScrollTop;
          onScroll();
        }
        if (currentWindowScrollY !== lastWindowScrollY) {
          console.log('🚨 SCROLL DETECTED via POLLING on window!', {
            from: lastWindowScrollY,
            to: currentWindowScrollY
          });
          lastWindowScrollY = currentWindowScrollY;
          onScroll();
        }
      };

      const pollInterval = setInterval(pollForScroll, 100);

      setTimeout(() => {
        viewport.removeEventListener('scroll', testViewport);
        document.removeEventListener('scroll', testDocument);
        window.removeEventListener('scroll', testWindow);
        if (contents) contents.removeEventListener('scroll', testContents);
        clearInterval(pollInterval);
        console.log('🧪 All test scroll listeners and polling removed');
      }, 10000);
    }
  }

  const observer = new ResizeObserver((entries) => {
    if (debug) console.log('ResizeObserver triggered', entries.length, 'entries');
    for (const _entry of entries) {
      updateMeasurements();
    }
  });

  observer.observe(viewport);
  if (debug) console.log('setupViewport: ResizeObserver attached');

  // Store the scrollable element for measurements
  actualScrollElement = scrollableElement;

  // DEBUGGING: Let's scan the entire DOM tree to find what's actually scrolling
  if (debug) {
    console.log('🔍 COMPREHENSIVE SCROLL ELEMENT SCAN:');

    // Check all elements in the viewport tree
    function scanElement(el: Element, depth = 0): void {
      const indent = '  '.repeat(depth);
      const style = getComputedStyle(el);
      const canScroll = el.scrollHeight > el.clientHeight;
      const hasOverflow = style.overflowY !== 'visible' && style.overflowY !== 'hidden';

      console.log(`${indent}${el.tagName}.${el.className || 'no-class'}`, {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
        canScroll,
        overflowY: style.overflowY,
        hasOverflow,
        isScrollable: canScroll && hasOverflow
      });

      // Test scroll on any potentially scrollable element
      if (canScroll || hasOverflow) {
        const testListener = () =>
          console.log(`🎯 SCROLL DETECTED ON: ${el.tagName}.${el.className}`);
        el.addEventListener('scroll', testListener, { passive: true });
        setTimeout(() => el.removeEventListener('scroll', testListener), 3000);
      }

      // Recurse into children (max 3 levels deep to avoid spam)
      if (depth < 3) {
        for (let i = 0; i < el.children.length; i++) {
          scanElement(el.children[i], depth + 1);
        }
      }
    }

    scanElement(viewport);
  }

  // Initial measurement
  updateMeasurements();

  return () => {
    if (debug) console.log('setupViewport: Cleaning up');

    // Clean up all possible scroll listeners
    if (scrollableElement !== viewport) {
      scrollableElement.removeEventListener('scroll', onScroll);
    } else {
      viewport.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
      if (contents && contents !== viewport) {
        contents.removeEventListener('scroll', onScroll);
      }
    }

    observer.unobserve(viewport);
    observer.disconnect();
  };
}

function setupTrack(track: HTMLDivElement) {
  if (!track) return;

  const handleTrackEnter = () => {
    clearTimer();
    if (showThumbOnTrackEnter && !trackHovered) {
      if (trackHoverTimer) {
        window.clearTimeout(trackHoverTimer);
        trackHoverTimer = 0;
      }

      trackHoverTimer = window.setTimeout(() => {
        trackHovered = true;
        updateMeasurements(); // Recalculate visibility
        if (isVisible) {
          onshow?.();
        }
        trackHoverTimer = 0;
      }, 300);
    } else if (!showThumbOnTrackEnter) {
      trackHovered = true;
    }
  };

  const handleTrackLeave = () => {
    if (trackHoverTimer) {
      window.clearTimeout(trackHoverTimer);
      trackHoverTimer = 0;
    }

    if (showThumbOnTrackEnter && trackHovered) {
      trackHovered = false;
      updateMeasurements(); // Recalculate visibility
    } else if (!showThumbOnTrackEnter) {
      trackHovered = false;
    }
    clearTimer();
    setupTimer();
  };

  track.addEventListener('mouseenter', handleTrackEnter);
  track.addEventListener('mouseleave', handleTrackLeave);
  return () => {
    track.removeEventListener('mouseenter', handleTrackEnter);
    track.removeEventListener('mouseleave', handleTrackLeave);
    clearTrackHoverTimer();
  };
}

function setupThumb(thumb: HTMLDivElement) {
  if (!thumb) return;

  const handleThumbEnter = () => {
    thumbHovered = true;
  };

  const handleThumbLeave = () => {
    thumbHovered = false;
  };

  thumb.addEventListener('mousedown', onThumbDown, { passive: true });
  thumb.addEventListener('touchstart', onThumbDown, { passive: true });
  thumb.addEventListener('mouseenter', handleThumbEnter);
  thumb.addEventListener('mouseleave', handleThumbLeave);

  return () => {
    thumb.removeEventListener('mousedown', onThumbDown);
    thumb.removeEventListener('touchstart', onThumbDown);
    thumb.removeEventListener('mouseenter', handleThumbEnter);
    thumb.removeEventListener('mouseleave', handleThumbLeave);
  };
}

function setupContents(contents: Element) {
  if (!contents) return;

  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.');
  }

  const observer = new ResizeObserver((entries) => {
    for (const _entry of entries) {
      updateMeasurements();
    }
  });

  observer.observe(contents);

  return () => {
    observer.unobserve(contents);
    observer.disconnect();
  };
}

function setupTimer() {
  timer = window.setTimeout(() => {
    // Reset interaction state after timeout
    interacted = false;

    // Update visibility after resetting interaction
    updateMeasurements();

    // Call onhide callback
    onhide?.();
  }, hideAfter);
}

function clearTimer() {
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
}

function clearTrackHoverTimer() {
  if (trackHoverTimer) {
    window.clearTimeout(trackHoverTimer);
    trackHoverTimer = 0;
  }
}

function onScroll() {
  if (!viewport) return;

  clearTimer();
  setupTimer();

  updateMeasurements();

  interacted = true;
  onshow?.();
}

function onTrackEnter() {
  clearTimer();
  trackHovered = true;
  if (showThumbOnTrackEnter) {
    thumbHovered = true;
  }
}

function onTrackLeave() {
  clearTimer();
  setupTimer();
  trackHovered = false;
  if (showThumbOnTrackEnter) {
    thumbHovered = false;
  }
}

function onThumbDown(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  thumbDragging = true;
  startTop = actualScrollElement?.scrollTop ?? 0;
  startY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;

  document.addEventListener('mousemove', onThumbMove);
  document.addEventListener('touchmove', onThumbMove);
  document.addEventListener('mouseup', onThumbUp);
  document.addEventListener('touchend', onThumbUp);
}

function onThumbMove(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  const clientY =
    'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;
  const ratio = wholeHeight / trackHeight;

  if (actualScrollElement) {
    actualScrollElement.scrollTop = startTop + ratio * (clientY - startY);
  }
}

function onThumbUp(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  thumbDragging = false;
  startTop = 0;
  startY = 0;

  document.removeEventListener('mousemove', onThumbMove);
  document.removeEventListener('touchmove', onThumbMove);
  document.removeEventListener('mouseup', onThumbUp);
  document.removeEventListener('touchend', onThumbUp);
}

onMount(() => {
  if (debug) {
    console.log('Svrollbar mounted with:', { viewport, contents });
  }

  // Setup everything once on mount
  setupAll();

  // Watch for changes to viewport/contents and re-setup
  let lastViewport = viewport;
  let lastContents = contents;
  let lastVTrack = vTrack;
  let lastVThumb = vThumb;

  const checkInterval = setInterval(() => {
    if (
      viewport !== lastViewport ||
      contents !== lastContents ||
      vTrack !== lastVTrack ||
      vThumb !== lastVThumb
    ) {
      if (debug) console.log('Elements changed, re-setting up');
      setupAll();
      lastViewport = viewport;
      lastContents = contents;
      lastVTrack = vTrack;
      lastVThumb = vThumb;
    }
  }, 100);

  return () => {
    clearInterval(checkInterval);
  };
});

onDestroy(() => {
  teardownViewport?.();
  teardownContents?.();
  teardownTrack?.();
  teardownThumb?.();
});
</script>

{#if isVisible || showThumbOnTrackEnter}
  <div
    class="v-scrollbar"
    class:fixed={windowScrollEnabled}
    style:width="{width.track}px"
    style:height="{trackHeight}px"
    style:margin-top="{marginTop}px"
    style:margin-right="{marginRight}px"
    style:margin-bottom="{marginBottom}px"
    style:margin-left="{marginLeft}px">
    <div
      bind:this={vTrack}
      class="v-track"
      style:width="{width.track}px"
      style:height="{trackHeight}px"
      style:opacity={opacity.track}
      in:vTrackIn
      out:vTrackOut>
    </div>
    {#if isVisible}
      <div
        bind:this={vThumb}
        class="v-thumb"
        style:top="{thumbTop}px"
        style:width="{thumbHovered || thumbDragging
          ? width.thumbActive
          : width.thumb}px"
        style:height="{thumbHeight}px"
        style:opacity={thumbHovered || thumbDragging
          ? opacity.thumbActive
          : opacity.thumb}
        in:vThumbIn
        out:vThumbOut>
      </div>
    {/if}
  </div>
{/if}

<style>
.v-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.v-scrollbar.fixed {
  position: fixed;
}

.v-track {
  position: absolute;
  top: 0;
  right: 0;
  border-radius: var(--svrollbar-track-radius, initial);
  background: var(--svrollbar-track-background, initial);
  box-shadow: var(--svrollbar-track-shadow, initial);
  pointer-events: auto;
}

.v-thumb {
  position: relative;
  margin: 0 auto;
  border-radius: var(--svrollbar-thumb-radius, 0.25rem);
  background: var(--svrollbar-thumb-background, gray);
  box-shadow: var(--svrollbar-thumb-shadow, initial);
  pointer-events: auto;
  cursor: pointer;
  transition:
    width 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
}
</style>
// SVELTE
import { fade } from 'svelte/transition';
import { onDestroy, onMount } from 'svelte';

let {
  viewport = $bindable<Element>(),
  contents = $bindable<Element>(),
  hideAfter = 1000,
  alwaysVisible = false,
  initiallyVisible = false,
  showThumbOnTrackEnter = false,
  margin = {} as { top?: number; right?: number; bottom?: number; left?: number },
  width = {
    track: 10,
    thumb: 8,
    thumbActive: 12
  } as { track?: number; thumb?: number; thumbActive?: number },
  opacity = {
    track: 1,
    thumb: 0.5,
    thumbActive: 0.8
  } as { track?: number; thumb?: number; thumbActive?: number },
  vTrackIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vTrackOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  vThumbIn = (node: HTMLElement) => fade(node, { duration: 100 }),
  vThumbOut = (node: HTMLElement) => fade(node, { duration: 300 }),
  onshow = undefined as (() => void) | undefined,
  onhide = undefined as (() => void) | undefined,
  debug = false
} = $props();

// ═══════════════════════
// 2. STATE
// ═══════════════════════

let vTrack = $state<HTMLDivElement>();
let vThumb = $state<HTMLDivElement>();
let startTop = $state(0);
let startY = $state(0);
let timer = $state(0);
let trackHoverTimer = $state(0);
let windowScrollEnabled = $state(false);
let interacted = $state(false);
let trackHovered = $state(false);
let thumbHovered = $state(false);
let thumbDragging = $state(false);

let wholeHeight = $state(0);
let scrollTop = $state(0);
let trackHeight = $state(0);
let thumbHeight = $state(0);
let thumbTop = $state(0);

let teardownViewport = $state<(() => void) | undefined>();
let teardownContents = $state<(() => void) | undefined>();
let teardownTrack = $state<(() => void) | undefined>();
let teardownThumb = $state<(() => void) | undefined>();

// Non-reactive calculations to avoid infinite loops
let isScrollable = $state(false);
let isVisible = $state(false);

// The actual element that handles scrolling (might be different from viewport)
let actualScrollElement = $state<Element | undefined>();

// ═══════════════════════
// 3. DERIVED VALUES
// ═══════════════════════

const marginTop = $derived(margin.top ?? 0);
const marginBottom = $derived(margin.bottom ?? 0);
const marginRight = $derived(margin.right ?? 0);
const marginLeft = $derived(margin.left ?? 0);

// ═══════════════════════
// 4. SETUP FUNCTIONS
// ═══════════════════════

// Update measurements only when needed, not in a reactive loop
function updateMeasurements() {
  if (!viewport || !actualScrollElement) return;

  // Use actualScrollElement for scroll measurements, viewport for sizing
  const newWholeHeight = actualScrollElement.scrollHeight;
  const newScrollTop = actualScrollElement.scrollTop;
  const newTrackHeight = viewport.clientHeight - (marginTop + marginBottom);
  const newThumbHeight =
    newWholeHeight > 0 ? (newTrackHeight / newWholeHeight) * newTrackHeight : 0;
  const newThumbTop =
    newWholeHeight > 0 ? (newScrollTop / newWholeHeight) * newTrackHeight : 0;
  const newScrollable = newWholeHeight > newTrackHeight;
  const newVisible =
    newScrollable &&
    (alwaysVisible ||
      initiallyVisible ||
      (showThumbOnTrackEnter && trackHovered) ||
      interacted);

  // Only update state if values actually changed
  if (wholeHeight !== newWholeHeight) wholeHeight = newWholeHeight;
  if (scrollTop !== newScrollTop) scrollTop = newScrollTop;
  if (trackHeight !== newTrackHeight) trackHeight = newTrackHeight;
  if (thumbHeight !== newThumbHeight) thumbHeight = newThumbHeight;
  if (thumbTop !== newThumbTop) thumbTop = newThumbTop;
  if (isScrollable !== newScrollable) isScrollable = newScrollable;
  if (isVisible !== newVisible) isVisible = newVisible;

  if (debug) {
    console.log('Measurements updated:', {
      wholeHeight,
      scrollTop,
      trackHeight,
      thumbHeight,
      thumbTop,
      isScrollable,
      isVisible,
      viewportClientHeight: viewport.clientHeight,
      actualScrollHeight: actualScrollElement.scrollHeight,
      actualScrollTop: actualScrollElement.scrollTop
    });
  }
}

function setupAll() {
  if (debug) console.log('Setting up all components');

  if (viewport) {
    teardownViewport?.();
    teardownViewport = setupViewport(viewport);
  }

  if (contents) {
    teardownContents?.();
    teardownContents = setupContents(contents);
  }

  if (vTrack) {
    teardownTrack?.();
    teardownTrack = setupTrack(vTrack);
  }

  if (vThumb) {
    teardownThumb?.();
    teardownThumb = setupThumb(vThumb);
  }
}

function setupViewport(viewport: Element) {
  if (!viewport) {
    if (debug) console.log('setupViewport: No viewport provided');
    return;
  }

  if (debug) {
    console.log('setupViewport: Starting setup', {
      viewport,
      tagName: viewport.tagName,
      id: viewport.id,
      className: viewport.className,
      scrollHeight: viewport.scrollHeight,
      clientHeight: viewport.clientHeight,
      scrollTop: viewport.scrollTop,
      overflowY: getComputedStyle(viewport).overflowY,
      overflowX: getComputedStyle(viewport).overflowX
    });
  }

  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.');
  }

  windowScrollEnabled = document.scrollingElement === viewport;
  if (debug) console.log('setupViewport: windowScrollEnabled =', windowScrollEnabled);

  // Find the actual scrollable element
  let scrollableElement = viewport;
  const computedStyle = getComputedStyle(viewport);

  // If viewport has overflow:hidden, look for a scrollable child
  if (computedStyle.overflowY === 'hidden' || computedStyle.overflow === 'hidden') {
    if (debug)
      console.log('Viewport has overflow:hidden, looking for scrollable child...');

    // First, always try the contents element if provided
    if (contents && contents !== viewport) {
      const contentsStyle = getComputedStyle(contents);
      if (debug)
        console.log('Checking contents element:', {
          element: contents,
          tagName: contents.tagName,
          className: contents.className,
          overflowY: contentsStyle.overflowY,
          overflow: contentsStyle.overflow,
          scrollHeight: contents.scrollHeight,
          clientHeight: contents.clientHeight,
          canScroll: contents.scrollHeight > contents.clientHeight
        });

      // Use contents if it can scroll, regardless of CSS overflow setting
      if (contents.scrollHeight > contents.clientHeight) {
        scrollableElement = contents;
        if (debug)
          console.log(
            '✅ Using contents as scrollable element (has scrollable content)'
          );
      }
    }

    // If contents didn't work, look through children
    if (scrollableElement === viewport) {
      const children = viewport.children;
      if (debug)
        console.log(`Searching ${children.length} children for scrollable elements...`);

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const childStyle = getComputedStyle(child);
        const canScroll = child.scrollHeight > child.clientHeight;

        if (debug)
          console.log(`Child ${i}:`, {
            tagName: child.tagName,
            className: child.className,
            overflowY: childStyle.overflowY,
            overflow: childStyle.overflow,
            scrollHeight: child.scrollHeight,
            clientHeight: child.clientHeight,
            canScroll
          });

        if (canScroll) {
          scrollableElement = child;
          if (debug) console.log(`✅ Found scrollable child ${i}:`, child);
          break;
        }
      }
    }
  }

  if (debug) {
    console.log('Final scrollable element:', {
      element: scrollableElement,
      tagName: scrollableElement.tagName,
      className: scrollableElement.className,
      overflowY: getComputedStyle(scrollableElement).overflowY,
      scrollHeight: scrollableElement.scrollHeight,
      clientHeight: scrollableElement.clientHeight,
      scrollTop: scrollableElement.scrollTop
    });
  }

  // If we found a proper scrollable element, use it
  if (scrollableElement !== viewport) {
    scrollableElement.addEventListener('scroll', onScroll, { passive: true });
    if (debug)
      console.log('setupViewport: Scroll listener added to', scrollableElement.tagName);
  } else {
    // Fallback: listen to multiple possible scroll sources
    if (debug)
      console.log(
        '🔄 No explicit scrollable element found, using fallback scroll detection'
      );

    // Try the viewport itself
    viewport.addEventListener('scroll', onScroll, { passive: true });

    // Also try document scroll (for cases where browser handles scrolling)
    document.addEventListener('scroll', onScroll, { passive: true });

    // And try contents element if it exists
    if (contents && contents !== viewport) {
      contents.addEventListener('scroll', onScroll, { passive: true });
    }

    if (debug) {
      console.log('Added scroll listeners to: viewport, document, and contents');

      // Add test listeners to ALL possible scroll sources
      const testViewport = () => console.log('🎯 SCROLL on VIEWPORT');
      const testDocument = () => console.log('🎯 SCROLL on DOCUMENT');
      const testContents = () => console.log('🎯 SCROLL on CONTENTS');
      const testWindow = () => console.log('🎯 SCROLL on WINDOW');

      viewport.addEventListener('scroll', testViewport, { passive: true });
      document.addEventListener('scroll', testDocument, { passive: true });
      window.addEventListener('scroll', testWindow, { passive: true });
      if (contents)
        contents.addEventListener('scroll', testContents, { passive: true });

      // Check for scroll interference
      console.log('🔍 CHECKING FOR SCROLL INTERFERENCE:');

      // Check if elements can actually be scrolled programmatically
      const testScroll = () => {
        const originalViewportScroll = viewport.scrollTop;
        const originalDocumentScroll = document.documentElement.scrollTop;
        const originalWindowScroll = window.scrollY;

        // Try to scroll each element programmatically
        try {
          viewport.scrollTop = viewport.scrollTop + 1;
          console.log('✅ Viewport can be scrolled programmatically', {
            before: originalViewportScroll,
            after: viewport.scrollTop
          });
        } catch (e) {
          console.log('❌ Viewport cannot be scrolled programmatically', e);
        }

        try {
          document.documentElement.scrollTop = document.documentElement.scrollTop + 1;
          console.log('✅ Document can be scrolled programmatically', {
            before: originalDocumentScroll,
            after: document.documentElement.scrollTop
          });
        } catch (e) {
          console.log('❌ Document cannot be scrolled programmatically', e);
        }

        try {
          window.scrollTo(0, window.scrollY + 1);
          console.log('✅ Window can be scrolled programmatically', {
            before: originalWindowScroll,
            after: window.scrollY
          });
        } catch (e) {
          console.log('❌ Window cannot be scrolled programmatically', e);
        }

        // Check for event listener interference
        const eventListeners = (window as any).getEventListeners
          ? (window as any).getEventListeners(viewport)
          : 'getEventListeners not available';
        console.log('🎧 Event listeners on viewport:', eventListeners);

        // Check computed styles that might prevent scrolling
        const viewportStyle = getComputedStyle(viewport);
        console.log('🎨 Viewport scroll-affecting styles:', {
          overflow: viewportStyle.overflow,
          overflowX: viewportStyle.overflowX,
          overflowY: viewportStyle.overflowY,
          height: viewportStyle.height,
          maxHeight: viewportStyle.maxHeight,
          position: viewportStyle.position,
          touchAction: viewportStyle.touchAction,
          userSelect: viewportStyle.userSelect,
          pointerEvents: viewportStyle.pointerEvents
        });
      };

      setTimeout(testScroll, 1000);

      // ULTIMATE TEST: Use polling to detect scroll changes
      let lastScrollTop = actualScrollElement?.scrollTop ?? 0;
      let lastViewportScrollTop = viewport.scrollTop;
      let lastDocumentScrollTop = document.documentElement.scrollTop;
      let lastWindowScrollY = window.scrollY;

      const pollForScroll = () => {
        const currentScrollTop = actualScrollElement?.scrollTop ?? 0;
        const currentViewportScrollTop = viewport.scrollTop;
        const currentDocumentScrollTop = document.documentElement.scrollTop;
        const currentWindowScrollY = window.scrollY;

        // Also check all parent elements for scroll changes
        let parent = viewport.parentElement;
        let parentScrollDetected = false;
        while (parent && parent !== document.body) {
          const parentScrollTop = parent.scrollTop;
          if (parentScrollTop > 0) {
            console.log('🚨 FOUND PARENT ELEMENT WITH SCROLL!', {
              element: parent,
              tagName: parent.tagName,
              className: parent.className,
              scrollTop: parentScrollTop,
              scrollHeight: parent.scrollHeight,
              clientHeight: parent.clientHeight
            });
            parentScrollDetected = true;
            // Add listener to this parent
            const parentListener = () =>
              console.log('🎯 PARENT SCROLL EVENT!', parent?.tagName);
            parent?.addEventListener('scroll', parentListener, { passive: true });
            setTimeout(
              () => parent?.removeEventListener('scroll', parentListener),
              5000
            );
          }
          parent = parent.parentElement;
        }

        if (currentScrollTop !== lastScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on actualScrollElement!', {
            from: lastScrollTop,
            to: currentScrollTop
          });
          lastScrollTop = currentScrollTop;
          onScroll(); // Manually trigger our scroll handler
        }
        if (currentViewportScrollTop !== lastViewportScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on viewport!', {
            from: lastViewportScrollTop,
            to: currentViewportScrollTop
          });
          lastViewportScrollTop = currentViewportScrollTop;
          onScroll();
        }
        if (currentDocumentScrollTop !== lastDocumentScrollTop) {
          console.log('🚨 SCROLL DETECTED via POLLING on document!', {
            from: lastDocumentScrollTop,
            to: currentDocumentScrollTop
          });
          lastDocumentScrollTop = currentDocumentScrollTop;
          onScroll();
        }
        if (currentWindowScrollY !== lastWindowScrollY) {
          console.log('🚨 SCROLL DETECTED via POLLING on window!', {
            from: lastWindowScrollY,
            to: currentWindowScrollY
          });
          lastWindowScrollY = currentWindowScrollY;
          onScroll();
        }
      };

      const pollInterval = setInterval(pollForScroll, 100);

      setTimeout(() => {
        viewport.removeEventListener('scroll', testViewport);
        document.removeEventListener('scroll', testDocument);
        window.removeEventListener('scroll', testWindow);
        if (contents) contents.removeEventListener('scroll', testContents);
        clearInterval(pollInterval);
        console.log('🧪 All test scroll listeners and polling removed');
      }, 10000);
    }
  }

  const observer = new ResizeObserver((entries) => {
    if (debug) console.log('ResizeObserver triggered', entries.length, 'entries');
    for (const _entry of entries) {
      updateMeasurements();
    }
  });

  observer.observe(viewport);
  if (debug) console.log('setupViewport: ResizeObserver attached');

  // Store the scrollable element for measurements
  actualScrollElement = scrollableElement;

  // DEBUGGING: Let's scan the entire DOM tree to find what's actually scrolling
  if (debug) {
    console.log('🔍 COMPREHENSIVE SCROLL ELEMENT SCAN:');

    // Check all elements in the viewport tree
    function scanElement(el: Element, depth = 0): void {
      const indent = '  '.repeat(depth);
      const style = getComputedStyle(el);
      const canScroll = el.scrollHeight > el.clientHeight;
      const hasOverflow = style.overflowY !== 'visible' && style.overflowY !== 'hidden';

      console.log(`${indent}${el.tagName}.${el.className || 'no-class'}`, {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
        canScroll,
        overflowY: style.overflowY,
        hasOverflow,
        isScrollable: canScroll && hasOverflow
      });

      // Test scroll on any potentially scrollable element
      if (canScroll || hasOverflow) {
        const testListener = () =>
          console.log(`🎯 SCROLL DETECTED ON: ${el.tagName}.${el.className}`);
        el.addEventListener('scroll', testListener, { passive: true });
        setTimeout(() => el.removeEventListener('scroll', testListener), 3000);
      }

      // Recurse into children (max 3 levels deep to avoid spam)
      if (depth < 3) {
        for (let i = 0; i < el.children.length; i++) {
          scanElement(el.children[i], depth + 1);
        }
      }
    }

    scanElement(viewport);
  }

  // Initial measurement
  updateMeasurements();

  return () => {
    if (debug) console.log('setupViewport: Cleaning up');

    // Clean up all possible scroll listeners
    if (scrollableElement !== viewport) {
      scrollableElement.removeEventListener('scroll', onScroll);
    } else {
      viewport.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll);
      if (contents && contents !== viewport) {
        contents.removeEventListener('scroll', onScroll);
      }
    }

    observer.unobserve(viewport);
    observer.disconnect();
  };
}

function setupTrack(track: HTMLDivElement) {
  if (!track) return;

  const handleTrackEnter = () => {
    clearTimer();
    if (showThumbOnTrackEnter && !trackHovered) {
      if (trackHoverTimer) {
        window.clearTimeout(trackHoverTimer);
        trackHoverTimer = 0;
      }

      trackHoverTimer = window.setTimeout(() => {
        trackHovered = true;
        updateMeasurements(); // Recalculate visibility
        if (isVisible) {
          onshow?.();
        }
        trackHoverTimer = 0;
      }, 300);
    } else if (!showThumbOnTrackEnter) {
      trackHovered = true;
    }
  };

  const handleTrackLeave = () => {
    if (trackHoverTimer) {
      window.clearTimeout(trackHoverTimer);
      trackHoverTimer = 0;
    }

    if (showThumbOnTrackEnter && trackHovered) {
      trackHovered = false;
      updateMeasurements(); // Recalculate visibility
    } else if (!showThumbOnTrackEnter) {
      trackHovered = false;
    }
    clearTimer();
    setupTimer();
  };

  track.addEventListener('mouseenter', handleTrackEnter);
  track.addEventListener('mouseleave', handleTrackLeave);
  return () => {
    track.removeEventListener('mouseenter', handleTrackEnter);
    track.removeEventListener('mouseleave', handleTrackLeave);
    clearTrackHoverTimer();
  };
}

function setupThumb(thumb: HTMLDivElement) {
  if (!thumb) return;

  const handleThumbEnter = () => {
    thumbHovered = true;
  };

  const handleThumbLeave = () => {
    thumbHovered = false;
  };

  thumb.addEventListener('mousedown', onThumbDown, { passive: true });
  thumb.addEventListener('touchstart', onThumbDown, { passive: true });
  thumb.addEventListener('mouseenter', handleThumbEnter);
  thumb.addEventListener('mouseleave', handleThumbLeave);

  return () => {
    thumb.removeEventListener('mousedown', onThumbDown);
    thumb.removeEventListener('touchstart', onThumbDown);
    thumb.removeEventListener('mouseenter', handleThumbEnter);
    thumb.removeEventListener('mouseleave', handleThumbLeave);
  };
}

function setupContents(contents: Element) {
  if (!contents) return;

  if (typeof window.ResizeObserver === 'undefined') {
    throw new Error('window.ResizeObserver is missing.');
  }

  const observer = new ResizeObserver((entries) => {
    for (const _entry of entries) {
      updateMeasurements();
    }
  });

  observer.observe(contents);

  return () => {
    observer.unobserve(contents);
    observer.disconnect();
  };
}

function setupTimer() {
  timer = window.setTimeout(() => {
    // Reset interaction state after timeout
    interacted = false;

    // Update visibility after resetting interaction
    updateMeasurements();

    // Call onhide callback
    onhide?.();
  }, hideAfter);
}

function clearTimer() {
  if (timer) {
    window.clearTimeout(timer);
    timer = 0;
  }
}

function clearTrackHoverTimer() {
  if (trackHoverTimer) {
    window.clearTimeout(trackHoverTimer);
    trackHoverTimer = 0;
  }
}

function onScroll() {
  if (!viewport) return;

  clearTimer();
  setupTimer();

  updateMeasurements();

  interacted = true;
  onshow?.();
}

function onTrackEnter() {
  clearTimer();
  trackHovered = true;
  if (showThumbOnTrackEnter) {
    thumbHovered = true;
  }
}

function onTrackLeave() {
  clearTimer();
  setupTimer();
  trackHovered = false;
  if (showThumbOnTrackEnter) {
    thumbHovered = false;
  }
}

function onThumbDown(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  thumbDragging = true;
  startTop = actualScrollElement?.scrollTop ?? 0;
  startY = 'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;

  document.addEventListener('mousemove', onThumbMove);
  document.addEventListener('touchmove', onThumbMove);
  document.addEventListener('mouseup', onThumbUp);
  document.addEventListener('touchend', onThumbUp);
}

function onThumbMove(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  const clientY =
    'changedTouches' in event ? event.changedTouches[0].clientY : event.clientY;
  const ratio = wholeHeight / trackHeight;

  if (actualScrollElement) {
    actualScrollElement.scrollTop = startTop + ratio * (clientY - startY);
  }
}

function onThumbUp(event: MouseEvent | TouchEvent) {
  event.stopPropagation();
  event.preventDefault();

  thumbDragging = false;
  startTop = 0;
  startY = 0;

  document.removeEventListener('mousemove', onThumbMove);
  document.removeEventListener('touchmove', onThumbMove);
  document.removeEventListener('mouseup', onThumbUp);
  document.removeEventListener('touchend', onThumbUp);
}

onMount(() => {
  if (debug) {
    console.log('Svrollbar mounted with:', { viewport, contents });
  }

  // Setup everything once on mount
  setupAll();

  // Watch for changes to viewport/contents and re-setup
  let lastViewport = viewport;
  let lastContents = contents;
  let lastVTrack = vTrack;
  let lastVThumb = vThumb;

  const checkInterval = setInterval(() => {
    if (
      viewport !== lastViewport ||
      contents !== lastContents ||
      vTrack !== lastVTrack ||
      vThumb !== lastVThumb
    ) {
      if (debug) console.log('Elements changed, re-setting up');
      setupAll();
      lastViewport = viewport;
      lastContents = contents;
      lastVTrack = vTrack;
      lastVThumb = vThumb;
    }
  }, 100);

  return () => {
    clearInterval(checkInterval);
  };
});

onDestroy(() => {
  teardownViewport?.();
  teardownContents?.();
  teardownTrack?.();
  teardownThumb?.();
});
</script>

{#if isVisible || showThumbOnTrackEnter}
  <div
    class="v-scrollbar"
    class:fixed={windowScrollEnabled}
    style:width="{width.track}px"
    style:height="{trackHeight}px"
    style:margin-top="{marginTop}px"
    style:margin-right="{marginRight}px"
    style:margin-bottom="{marginBottom}px"
    style:margin-left="{marginLeft}px">
    <div
      bind:this={vTrack}
      class="v-track"
      style:width="{width.track}px"
      style:height="{trackHeight}px"
      style:opacity={opacity.track}
      in:vTrackIn
      out:vTrackOut>
    </div>
    {#if isVisible}
      <div
        bind:this={vThumb}
        class="v-thumb"
        style:top="{thumbTop}px"
        style:width="{thumbHovered || thumbDragging
          ? width.thumbActive
          : width.thumb}px"
        style:height="{thumbHeight}px"
        style:opacity={thumbHovered || thumbDragging
          ? opacity.thumbActive
          : opacity.thumb}
        in:vThumbIn
        out:vThumbOut>
      </div>
    {/if}
  </div>
{/if}

<style>
.v-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  pointer-events: none;
}

.v-scrollbar.fixed {
  position: fixed;
}

.v-track {
  position: absolute;
  top: 0;
  right: 0;
  border-radius: var(--svrollbar-track-radius, initial);
  background: var(--svrollbar-track-background, initial);
  box-shadow: var(--svrollbar-track-shadow, initial);
  pointer-events: auto;
}

.v-thumb {
  position: relative;
  margin: 0 auto;
  border-radius: var(--svrollbar-thumb-radius, 0.25rem);
  background: var(--svrollbar-thumb-background, gray);
  box-shadow: var(--svrollbar-thumb-shadow, initial);
  pointer-events: auto;
  cursor: pointer;
  transition:
    width 0.3s ease-in-out,
    opacity 0.3s ease-in-out;
}
</style>
