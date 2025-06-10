<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
import { watch } from 'runed';
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
import { setAppCtx } from '$lib/context/app.svelte';
import { setSidebarState } from '$lib/context/sidebar.svelte';
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

// Always set up map context, but only fetch data when authenticated
// CONTEXT :: APP
const appCtx = setAppCtx(queryClient, $session.data?.user as SessionUser | null);
// CONTEXT :: ADMIN
const adminCtx = setAdminCtx(queryClient, appCtx);

// CONTEXT :: SIDEBAR
setSidebarState();

// Re-initialize data when user becomes authenticated
watch(
  () => $session.data?.user,
  () => {
    if ($session.data?.user) {
      appCtx.setUser($session.data.user as SessionUser);
      appCtx.reinitializeWithAuth();
      appCtx.registerKeydownHandlers();
    } else if (!$session.data?.user && appCtx.user?.id) {
      appCtx.setUser(null);
    }
  }
);

// Initialize active resource and entity based on the current path
// TODO Replace with the correct check
let isMounted = $state(false);
onMount(() => {
  isMounted = true;
});
</script>

<!-- LAYOUT -->
<MinWidthProtector>
  {#if isMounted}
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
