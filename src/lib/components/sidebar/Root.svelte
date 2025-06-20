<script lang="ts">
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

// Get admin preference for auto-hide
const isPrimaryPanelAutoHide = $derived(
  adminCtx.appCtx.isAdmin() && adminCtx.appCtx.getUserPreferences().admin.isPrimaryPanelAutoHide
);

// Determine if sidebar should be visually open (considering auto-hide behavior)
const isVisuallyOpen = $derived(
  isPrimaryPanelAutoHide ? (sidebarState.isOpen() || isHovering) : sidebarState.isOpen()
);

// Sync visual state to sidebar context for child components
$effect(() => {
  sidebarState.setVisuallyOpen(isVisuallyOpen);
});

// Handle mouse enter - open on hover if auto-hide is enabled and sidebar is closed
function handleMouseEnter() {
  if (isPrimaryPanelAutoHide && !sidebarState.isOpen()) {
    isHovering = true;
    if (autoHideTimeout) {
      clearTimeout(autoHideTimeout);
      autoHideTimeout = null;
    }
  }
}

// Handle mouse leave - close with delay if auto-hide is enabled
function handleMouseLeave() {
  if (isPrimaryPanelAutoHide && !sidebarState.isOpen()) {
    // Add a small delay to prevent flickering when moving between sidebar elements
    autoHideTimeout = setTimeout(() => {
      isHovering = false;
      autoHideTimeout = null;
    }, 100);
  }
}
</script>

<!-- COMPONENT -->
<aside
  id="sidebar"
  class="flex-shrink-1 flex h-screen flex-col bg-base-300 caret-transparent transition-all"
  style="width: {isVisuallyOpen ? sidebarState.width.isOpen : sidebarState.width.isClosed}px"
  onmouseenter={handleMouseEnter}
  onmouseleave={handleMouseLeave}>
  <Header />
  <Sections />
</aside>
