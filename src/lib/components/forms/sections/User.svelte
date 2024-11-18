<script lang="ts">
import { onMount, onDestroy } from 'svelte';
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import Actions from '$lib/components/forms/actions/User.svelte';
import UserField from '$lib/components/forms/fields/Users.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { SectionProps } from '$lib/types';

// STATE : PROPS
let sectionProps: SectionProps = $props();
let { fields, resource } = sectionProps;

// STATE
let actionProps = $state({
  searchMode: false,
  removeMode: false
});
</script>

<div
  class="basis-2/3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0">
  <Header bind:actionProps {Actions} {...sectionProps} />
  {#each Object.entries(fields) as [fieldRoot, field], index}
    <UserField
      bind:actionProps
      {fieldRoot}
      userJoinStateKey="role"
      checkedValue={resource === 'project' ? 'maintainer' : 'owner'}
      uncheckedValue="member"
      {...sectionProps}
      index={index}
      />
  {/each}
</div>
