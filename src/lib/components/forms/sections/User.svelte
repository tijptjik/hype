<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/User.svelte';
import UserField from '$lib/components/forms/fields/Users.svelte';
// CONTEXT
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { SectionProps, EntityRouter } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields } = sectionProps;

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header {...sectionProps} bind:actionProps {Actions}  />
  {#each Object.entries(fields) as [fieldRoot, field], index}
    <UserField
      {...sectionProps}
      bind:actionProps
      {fieldRoot}
      userJoinStateKey="role"
      checkedValue={routerState.resource === 'project' ? 'maintainer' : 'owner'}
      uncheckedValue="member"
      index={index}
      />
  {/each}
</div>
