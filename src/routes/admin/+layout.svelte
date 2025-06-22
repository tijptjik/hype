<script lang="ts">
// SVELTE
import { watch } from 'runed';
import { afterNavigate } from '$app/navigation';
import { page } from '$app/state';
// COMPONENTS
import Sidebar from '$lib/components/sidebar/Root.svelte';
import SecondarySidebar from '$lib/components/sidebar/SecondarySidebar.svelte';
import MinWidthProtector from '$lib/components/layout/MinWidth.svelte';
import Settings from '$lib/components/panels/Settings.svelte';
// STYLES
import '$lib/styles/admin.css';
// CONTEXT
import { setAdminCtx } from '$lib/context/admin.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
import { setSidebarState as setSidebarCtx } from '$lib/context/sidebar.svelte';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';
// TYPES
import type { LayoutProps, LayoutData } from './$types';
import type { QueryClient } from '@tanstack/svelte-query';

type AdminRootProps = LayoutProps & {
  children: any;
  data: LayoutData & {
    queryClient: QueryClient;
  };
};

// PROPS
let { children, data }: AdminRootProps = $props();
const { queryClient } = data;

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx();

// CONTEXT :: ADMIN
const adminCtx = setAdminCtx(queryClient, appCtx);

// Initialize AdminCtx if AppCtx is ready
watch(
  () => appCtx.isInitialised,
  (isInitialised) => {
    if (isInitialised && !adminCtx.isInitialised) {
      adminCtx.init();
    }
  }
);

// CONTEXT :: SIDEBAR
setSidebarCtx();

// NAVIGATION :: Reset activeResourceRef when navigating to index pages
afterNavigate(() => {
  if (!adminCtx.isInitialised) return;

  const pathname = page.url.pathname;

  // Check if we're on an index page (no specific resource ref)
  const isIndexPage = Object.values(ResourcePath).some(
    (path) => pathname === `/admin/${path}` || pathname === `/admin/${path}/`
  );

  if (isIndexPage && adminCtx.activeResourceRef !== false) {
    // Extract resource type from path
    const resourceType = Object.entries(ResourcePath).find(([_, path]) =>
      pathname.includes(`/admin/${path}`)
    )?.[0] as FirstClassResource;

    if (resourceType) {
      adminCtx.setResourceRef(false, resourceType);
    }
  }
});
</script>

<!-- LAYOUT -->
<MinWidthProtector>
  {#if adminCtx.isInitialised}
    <div class="flex h-full w-full overflow-hidden drag-none">
      <Sidebar />
      <main
        class="flex h-full flex-1 flex-col overflow-hidden"
        class:pb-[72px]={!adminCtx.isViewportContained}>
        {@render children()}
      </main>
      <SecondarySidebar />
    </div>
    {#if appCtx.state.panels.settings}
      <div
        class="absolute inset-0 z-50 bg-black/50"
        onclick={() => appCtx.closePanel('settings')}>
        <div
          class="absolute right-0 top-0 h-full w-96 bg-base-100"
          onclick={(e) => e.stopPropagation()}>
          <Settings />
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="loading loading-ring loading-lg"></div>
    </div>
  {/if}
</MinWidthProtector>

<svelte:head>
  <link rel="stylesheet" href="/src/lib/styles/admin.css" />
</svelte:head>
