<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// Components
import Header from '$lib/components/forms/extra/Header.svelte';
import UserActions from '$lib/components/forms/actions/User.svelte';
import UserField from '$lib/components/forms/fields/Users.svelte';
import SearchBar from '$lib/components/forms/extra/HeaderSearch.svelte';
import Icon from '$lib/components/common/Icon.svelte';
import { ExclamationTriangle } from '@steeze-ui/heroicons';
// TYPES
import type { Resource, SectionProps, UserJoinConfig, UserRoleDisco, Form } from '$lib/types';
import { m } from '$lib/i18n';

// STATE : PROPS
let sectionProps: SectionProps & { joinConfig: UserJoinConfig } = $props();
let { form, fields, joinConfig } = sectionProps;
let formStore = $derived((form as Form).form);

// STATE
let searchMode = $state(false);
let removeMode = $state(false);

let fieldRoot = $derived(Object.keys(fields)[0] as keyof Resource);
</script>

<div
  class="basis-2/3 min-h-60 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 to-fuchsia-800 p-0 caret-transparent">
  <Header {...sectionProps}>
    {#snippet actionContent()}
      <UserActions bind:removeMode bind:searchMode />
    {/snippet}
  </Header>
  {#if searchMode}
    <SearchBar
      {...sectionProps}
      bind:searchMode
      apiPath="users"
      {fieldRoot}
      isExistingCheck={(r) =>
        !($formStore[fieldRoot] as unknown as UserRoleDisco[]).some(
          (userRole) => userRole.userId === r.id
        )} />
  {/if}
  {#if removeMode}
    <div
      transition:slide={{ duration: 200 }}
      class="alert w-full rounded-none border-0 border-b-4 border-warning caret-transparent">
      <Icon src={ExclamationTriangle} class="h-6 w-6 shrink-0 stroke-current" />
      <span
        ><span class="font-bold text-warning">{m.funny_bright_lynx_grin()}:</span>
        {m.active_nice_cougar_cook()}
      </span>
    </div>
  {/if}
  {#each Object.entries(fields) as [fieldRoot, field], index}
    <UserField
      {...sectionProps}
      bind:searchMode
      bind:removeMode
      fieldRoot={fieldRoot as keyof Resource}
      {joinConfig} />
  {/each}
</div>
