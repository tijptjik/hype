<script lang="ts">
// AUTH
import { useSession } from '$lib/auth/client';
// COMPONENTS
import Sidebar from '$lib/components/sidebar/Root.svelte';
import Navbar from '$lib/components/layout/Navbar.svelte';
import MinWidthProtector from '$lib/components/layout/MinWidth.svelte';
// STYLES
import '$lib/styles/admin.css';
// CONTEXT
import { setAdminCtx } from '$lib/context/admin.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
import { setSidebarState as setSidebarCtx } from '$lib/context/sidebar.svelte';
// TYPES
import type { LayoutProps, LayoutData } from './$types';
import type { QueryClient } from '@tanstack/svelte-query';
import type { SessionUser } from '$lib/types';

type AdminRootProps = LayoutProps & {
  children: any;
  data: LayoutData & {
    queryClient: QueryClient;
  };
};

// PROPS
let { children, data }: AdminRootProps = $props();
const { queryClient } = data;

// AUTH
const session = useSession();

// CONTEXT - Initialize with client session

// CONTEXT :: APP
// Get the shared AppCtx from root layout
const appCtx = getAppCtx();

// Initialize AppCtx if not already initialized
if (!appCtx.isInitialised) {
  const currentUser = $session.data?.user;
  if (currentUser) {
    appCtx.setUser(currentUser as SessionUser);
    appCtx.init(currentUser.id);
  } else {
    appCtx.init(null);
  }
}

// CONTEXT :: ADMIN
const adminCtx = setAdminCtx(queryClient, appCtx);

// CONTEXT :: SIDEBAR
setSidebarCtx();
</script>

<!-- LAYOUT -->
<MinWidthProtector>
  {#if adminCtx.isInitialised}
    <Sidebar />
    <div class="flex h-screen w-full select-none flex-col drag-none">
      <header class="flex-none bg-black">
        <Navbar />
      </header>
      <main
        class="flex h-full flex-1 flex-col overflow-hidden"
        class:pb-[72px]={!adminCtx.isViewportContained}>
        {@render children()}
      </main>
    </div>
  {:else}
    <div class="flex h-screen w-full items-center justify-center">
      <div class="loading loading-spinner loading-lg"></div>
    </div>
  {/if}
</MinWidthProtector>

<svelte:head>
  <link rel="stylesheet" href="/src/lib/styles/admin.css" />
</svelte:head>
