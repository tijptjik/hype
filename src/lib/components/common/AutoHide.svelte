<script lang="ts">
// SVELTE
import { onMount, onDestroy } from 'svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
//  ENUMS
import { Panel } from '$lib/enums';

// PROPS
let { children }: { children: any } = $props();

// CONTEXT
const adminCtx = getAdminCtx();
const appCtx = adminCtx.appCtx;

// STATE for auto-hide behavior
let isHovering = $state(false);
let autoHideTimeout: ReturnType<typeof setTimeout> | null = null;
let autoHideEnterTimeout: ReturnType<typeof setTimeout> | null = null;
let elementRef: HTMLElement;
let isWindowFocused = $state(true);
let lastMousePosition = $state({ x: 0, y: 0 });

// Get admin preferences
const adminPreferences = $derived(appCtx.getUserPreferences().admin);
const isPrimaryPanelAutoHide = $derived(
  adminCtx.appCtx.isAdmin() && (adminPreferences?.isPrimaryPanelAutoHide ?? false)
);

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

// Check if mouse is actually within the element bounds
function isMouseWithinElementBounds(): boolean {
  if (!elementRef) {
    return false;
  }

  const rect = elementRef.getBoundingClientRect();
  const { x, y } = lastMousePosition;

  const isWithin =
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

  return isWindowFocused && isWithin;
}

// Handle mouse enter - open on hover if auto-hide is enabled and panel is narrow
function handleMouseEnter() {
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout);
    autoHideEnterTimeout = null;
  }

  // Trigger auto-hide when auto-hide is enabled and panel is NOT explicitly open
  if (isPrimaryPanelAutoHide && !appCtx.isPanelOpen(Panel.admin)) {
    autoHideEnterTimeout = setTimeout(() => {
      // Only set hovering if mouse is actually still within bounds
      if (isMouseWithinElementBounds()) {
        const { x } = lastMousePosition;

        // Special handling for very small X values (likely edge cases)
        if (x < 15) {
          const firstCheckX = x;

          // First additional check after 50ms
          setTimeout(() => {
            if (isMouseWithinElementBounds()) {
              const { x: secondCheckX } = lastMousePosition;

              if (secondCheckX !== firstCheckX) {
                // X changed, expand panel visually
                appCtx.openPanelVisually(Panel.admin);
                isHovering = true;
              } else {
                // X didn't change, do second check after another 50ms
                setTimeout(() => {
                  if (isMouseWithinElementBounds()) {
                    const { x: thirdCheckX } = lastMousePosition;

                    if (thirdCheckX !== secondCheckX) {
                      // X changed in second check, expand panel visually
                      appCtx.openPanelVisually(Panel.admin);
                      isHovering = true;
                    }
                    // If X still hasn't changed after two checks, cancel expand (do nothing)
                  }
                }, 50);
              }
            }
          }, 50);
        } else {
          // Normal case - X is >= 15, expand visually immediately
          appCtx.openPanelVisually(Panel.admin);
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
  // Clear the enter timeout to prevent panel from expanding after mouse leaves
  if (autoHideEnterTimeout) {
    clearTimeout(autoHideEnterTimeout);
    autoHideEnterTimeout = null;
  }

  if (isPrimaryPanelAutoHide && isHovering && !appCtx.isPanelOpen(Panel.admin)) {
    // Only close if panel was opened via hover (not explicit toggle)
    // Add a small delay to prevent flickering when moving between elements
    autoHideTimeout = setTimeout(() => {
      appCtx.closePanelVisually(Panel.admin);
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

<div
  bind:this={elementRef}
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}>
  {@render children()}
</div>
