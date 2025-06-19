<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import FilterInput from '$lib/components/menu/FilterInput.svelte';
import NewEntityButton from '$lib/components/menu/NewEntityButton.svelte';
// CONFIG
import { navItems } from '$lib/navigation';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// AUTH
import { useSession } from '$lib/auth/client';
import { canCreateEntity } from '$lib/client/services/auth';
// TYPES
import type { SessionUser } from '$lib/types';
import type { FirstClassResource } from '$lib/enums';

let {
  filters,
  modes
}: {
  filters?: () => any;
  modes?: () => any;
} = $props();

let session = useSession();
let user = $session.data?.user as SessionUser;

// STATE : CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

// STATE : DERIVED :: RESOURCE MODE
let resource = $derived(
  adminCtx.activeResourceType as Exclude<
    FirstClassResource,
    FirstClassResource.property | FirstClassResource.task
  >
);
let resourceMode = $derived(adminCtx.isShowIndex);

// STATE : DERIVED :: TITLE
let title = $derived(resource ? navItems[resource].name : '');

// STATE : DERIVED :: SHOW NEW BUTTON
let showNewButton = $derived(user && resource && canCreateEntity(user, resource));
</script>

{#if resource}
  <header
    class="navbar h-17.5 px-12 py-4 caret-transparent shadow-lg"
    class:bg-base-300={resourceMode}
    class:bg-gradient-to-r={!resourceMode}
    class:from-rose-500={!resourceMode}
    class:to-fuchsia-800={!resourceMode}>
    <div class="flex-1">
      <div class="flex items-center space-x-4">
        <Icon src={navItems[resource].icon} class="h-6 w-6" />
        <h2 class="pr-2 text-2xl font-semibold">{title}</h2>
        {#if showNewButton}
          <NewEntityButton />
        {/if}
      </div>
    </div>
    <div class="flex flex-none items-center space-x-5">
      {#if filters}
        {@render filters()}
      {:else}
        <FilterInput resourceType={resource} rounded={true} />
      {/if}
      {#if modes}
        <div class="divider divider-horizontal"></div>
        {@render modes()}
      {/if}
    </div>
  </header>
{/if}
