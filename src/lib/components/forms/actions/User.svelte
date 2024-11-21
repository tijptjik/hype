<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';

import { UserPlus, XMark } from '@steeze-ui/heroicons';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { FieldProps, ModalProps, EntityRouter } from '$lib/types';

// STATE : PROPS
let {
  searchMode = $bindable(false),
  removeMode = $bindable(false)
}: FieldProps & ModalProps = $props();

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

const toggleSearch = (e: Event) => {
  e.preventDefault();
  searchMode = !searchMode;
};

const toggleRemoveMode = (e: Event) => {
  e.preventDefault();
  removeMode = !removeMode;
};
</script>

<div>
  {#if !searchMode && routerState.resource !== 'project'}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={toggleRemoveMode}>
      {#if !removeMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" /> <span class="hidden md:block"> 
        Remove User
      </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" /> <span class="hidden md:block">
        Stop Removing
      </span>
      {/if}
    </button>
  {/if}
  {#if !removeMode}
    <button class="btn-rounded btn btn-ghost ml-auto bg-base-100" onclick={toggleSearch} data-testid="addUserButton">
      {#if !searchMode}
        <Icon src={UserPlus} class="mr-2 h-4 w-4" /> <span class="hidden md:block">
        Add User
      </span>
      {:else}
        <Icon src={XMark} class="h-4 w-4" /><span class="hidden md:block">
        Stop Adding
      </span>
      {/if}
    </button>
  {/if}
</div>
