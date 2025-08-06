<script lang="ts">
// SVELTE
import { afterNavigate, beforeNavigate } from '$app/navigation';
import { page } from '$app/state';
// COMPONENTS
import Sidebar from '$lib/components/panels/Admin.svelte';
import AutoHide from '$lib/components/common/AutoHide.svelte';
import MinWidthProtector from '$lib/components/layout/MinWidth.svelte';
import Settings from '$lib/components/panels/Settings.svelte';
import Header from '$lib/components/resources/headers/HeaderRoot.svelte';
// STYLES
import '$lib/styles/admin.css';
// CONTEXT
import { setAdminCtx } from '$lib/context/admin.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
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
$effect(() => {
  appCtx.isInitialised;
  if (appCtx.isInitialised && !adminCtx.isInitialised) {
    adminCtx.init();
  }
});

// NAVIGATION :: Clear feature cache images when switching between admin/user apps
beforeNavigate(({ from, to }) => {
  if (!from || !to) return;

  const fromIsAdmin = from.route.id?.startsWith('/admin');
  const toIsAdmin = to.route.id?.startsWith('/admin');

  // Clear feature cache images when switching between admin and user apps
  if (fromIsAdmin !== toIsAdmin) {
    appCtx.clearFeatureCacheImages();
  }
});

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
  {#if adminCtx.isInitialised && appCtx.isInitialised}
    <div class="flex h-full w-full overflow-hidden drag-none">
      <AutoHide>
        <Sidebar />
      </AutoHide>
      <main
        class="flex h-full flex-1 flex-col overflow-hidden bg-gradient-to-bl from-rose-500 to-fuchsia-800 bg-fixed">
        <Header />
        {@render children()}
      </main>
      <Settings />
    </div>
  {:else}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="loading loading-ring loading-lg"></div>
    </div>
  {/if}
</MinWidthProtector>

<svelte:head>
  <link rel="stylesheet" href="/src/lib/styles/admin.css" />
</svelte:head>
