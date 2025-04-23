<script lang="ts">
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/User.svelte';
import UserField from '$lib/components/forms/fields/Users.svelte';
// TYPES
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields } = sectionProps;

// CONTEXT
const resourceState = getHierarchicalResourceState();

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});
</script>

<div
  class="from-rose-500 to-fuchsia-800 basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r p-0">
  <Header {...sectionProps} bind:actionProps {Actions} />
  {#each Object.entries(fields) as [fieldRoot, field], index}
    <UserField
      {...sectionProps}
      bind:actionProps
      {fieldRoot}
      userJoinStateKey="role"
      checkedValue={resourceState.activeResource === 'project' ? 'maintainer' : 'owner'}
      uncheckedValue="member"
      {index} />
  {/each}
</div>
