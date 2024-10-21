<script lang="ts">
import { ChevronRight } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';
import type { Component } from 'svelte';
import FormSectionHeaderSearch from './FormSectionHeaderSearch.svelte';
import { getForm } from '$lib/context/forms.svelte';

// TYPES
type Props = {
  title: string;
  Actions?: Component;
  actionProps?: Record<string, any>;
  Info?: Component;
  fields?: Record<string, Record<string, string>>;
  errors?: Record<string, string>;
};

// STATE : PROPS
let {
  title,
  Actions,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false
  }),
  Info,
  fields,
  errors,
}: Props = $props();

// STATE : CONTEXT
const { form, posted } = getForm();

$effect(() => {
  if ($posted) {
    actionProps.searchMode = false;
    actionProps.removeMode = false;
  }
});
</script>

<div class="flex flex-col">
  <div class="flex h-20 flex-row justify-between gap-2 bg-base-100 px-6">
    <div class="flex h-20 items-center gap-4">
      <Icon src={ChevronRight} class="h-6 w-6" />
      <h3 class="text-lg">{title}</h3>
      {#if $errors}
        {#each Object.entries($errors) as [fieldId, error]}
          {#if error && fields[fieldId] && error["_errors"] && error["_errors"].length > 0}
            {#each error["_errors"] as error}
            <div class="badge badge-lg font-mono p-3 text-base-content badge-error">{error}</div>
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
    {#if Actions}
      <div class="flex items-center gap-6">
        <Actions bind:searchMode={actionProps.searchMode} bind:removeMode={actionProps.removeMode} />
      </div>
    {/if}
    {#if Info}
      <div class="flex items-center gap-6">
        {@render Info()}
      </div>
    {/if}
  </div>
  <FormSectionHeaderSearch
    bind:searchMode={actionProps.searchMode}
    apiPath="users"
    destination="userRoles"
    toItem={(item) => ({
      organisationId: $form.id,
      role: 'member',
      user: item
    })}
    itemRef="id" />
</div>
