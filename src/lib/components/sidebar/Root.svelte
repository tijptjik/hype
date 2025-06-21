<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte';
// COMPONENTS
import Header from '$lib/components/sidebar/Header.svelte';
import Sections from '$lib/components/sidebar/Sections.svelte';
// CONTEXT
import { getSidebarState } from '$lib/context/sidebar.svelte';
import { getAdminCtx } from '$lib/context/admin.svelte';

// CONTEXT
const sidebarState = getSidebarState();
const adminCtx = getAdminCtx();

// STATE for auto-hide behavior
let isHovering = $state(false);
let autoHideTimeout: ReturnType<typeof setTimeout> | null = null;
let autoHideEnterTimeout: ReturnType<typeof setTimeout> | null = null;
let sidebarElement: HTMLElement;
let isWindowFocused = $state(true);
let lastMousePosition = $state({ x: 0, y: 0 });

// Get admin preferences
const adminPreferences = $derived(adminCtx.appCtx.getUserPreferences().admin);
const isPrimaryPanelAutoHide = $derived(
  adminCtx.appCtx.isAdmin() && (adminPreferences?.isPrimaryPanelAutoHide ?? false)
);
const isPrimaryPanelCollapsed = $derived(
  adminCtx.appCtx.isAdmin() && (adminPreferences?.isPrimaryPanelCollapsed ?? false)
);

// Initialize sidebar state based on admin preferences (only once)
let isInitialized = $state(false);
$effect(() => {
  if (adminCtx.isInitialised && !isInitialized) {
    sidebarState.initializeState(isPrimaryPanelCollapsed);
    isInitialized = true;
  }
});

// Track window focus state to handle mouse leaving window
$effect(() => {
  function handleWindowFocus() {
    isWindowFocused = true;
  }

  function handleWindowBlur() {
    isWindowFocused = false;
  }

  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);

  return () => {
    window.removeEventListener('focus', handleWindowFocus);
    window.removeEventListener('blur', handleWindowBlur);
  };
});

// Track mouse position globally
function handleGlobalMouseMove(event: MouseEvent) {
  lastMousePosition = { x: event.clientX, y: event.clientY };
}

// Handle mouse leaving the document entirely
function handleDocumentMouseLeave(event: MouseEvent) {
  // Mouse has left the document - set position to clearly outside bounds
  lastMousePosition = { x: -9999, y: -9999 };
}

// Check if mouse is actually within the sidebar element bounds
function isMouseWithinSidebarBounds(): boolean {
  if (!sidebarElement) {
    return false;
  }

  const rect = sidebarElement.getBoundingClientRect();
  const { x, y } = lastMousePosition;

  const isWithin =
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  return isWindowFocused && isWithin;
}

// Check if sidebar is actually being hovered and window is focused
function isSidebarHovered(): boolean {
  return isWindowFocused && (sidebarElement?.matches(':hover') ?? false);
}

// Determine if sidebar should be visually open (considering auto-hide behavior)
const isVisuallyOpen = $derived(
  isPrimaryPanelAutoHide ? sidebarState.isOpen() || isHovering : sidebarState.isOpen()
);

// Sync visual state to sidebar context for child components
$effect(() => {
  sidebarState.setVisuallyOpen(isVisuallyOpen);
});

// Handle mouse enter - open on hover if auto-hide is enabled and sidebar is closed
function handleMouseEnter() {
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout);
    autoHideEnterTimeout = null;
  }
  if (isPrimaryPanelAutoHide && !sidebarState.isOpen()) {
    autoHideEnterTimeout = setTimeout(() => {
      // OVERKILL CHECK: Only set hovering if mouse is actually still within bounds
      if (isMouseWithinSidebarBounds()) {
        const { x } = lastMousePosition;

        // Special handling for very small X values (likely edge cases)
        if (x < 15) {
          const firstCheckX = x;

          // First additional check after 50ms
          setTimeout(() => {
            if (isMouseWithinSidebarBounds()) {
              const { x: secondCheckX } = lastMousePosition;

              if (secondCheckX !== firstCheckX) {
                // X changed, open sidebar
                isHovering = true;
              } else {
                // X didn't change, do second check after another 50ms
                setTimeout(() => {
                  if (isMouseWithinSidebarBounds()) {
                    const { x: thirdCheckX } = lastMousePosition;

                    if (thirdCheckX !== secondCheckX) {
                      // X changed in second check, open sidebar
                      isHovering = true;
                    }
                    // If X still hasn't changed after two checks, cancel open (do nothing)
                  }
                }, 50);
              }
            }
          }, 50);
        } else {
          // Normal case - X is >= 15, open immediately
          isHovering = true;
        }
      }
    }, 750);
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
      autoHideTimeout = null;
    }
  }
}

// Handle mouse leave - close with delay if auto-hide is enabled
function handleMouseLeave() {
  // Clear the enter timeout to prevent sidebar from opening after mouse leaves
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout);
    autoHideEnterTimeout = null;
  }

  if (isPrimaryPanelAutoHide && !sidebarState.isOpen()) {
    // Add a small delay to prevent flickering when moving between sidebar elements
    autoHideTimeout = setTimeout(() => {
      isHovering = false;
      autoHideTimeout = null;
    }, 250);
  }
}

// LIFECYCLE
onMount(() => {
  // Add global mouse move listener to track position
  document.addEventListener('mousemove', handleGlobalMouseMove);
  // Add document mouse leave listener to detect mouse leaving browser
  document.addEventListener('mouseleave', handleDocumentMouseLeave);
});

onDestroy(() => {
  // Clean up listeners and timeouts
  document.removeEventListener('mousemove', handleGlobalMouseMove);
  document.removeEventListener('mouseleave', handleDocumentMouseLeave);
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout);
  }
  if (autoHideTimeout) {
    clearTimeout(autoHideTimeout);
  }
});
</script>

<!-- COMPONENT -->
<aside
  bind:this={sidebarElement}
  id="sidebar"
  class="flex-shrink-1 flex h-screen flex-col bg-base-300 caret-transparent transition-all"
  style="width: {isVisuallyOpen
    ? sidebarState.width.isOpen
    : sidebarState.width.isClosed}px"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}>
  <Header />
  <Sections />
</aside>
