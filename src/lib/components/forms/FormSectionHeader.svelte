<script lang="ts">
// COMPONENTS
import { Icon } from '@steeze-ui/svelte-icon';
import { ChevronRight } from '@steeze-ui/heroicons';
import FormSectionHeaderSearch from './FormSectionHeaderSearch.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import type { FormField, ResourceType } from '$lib/types';

// TYPES
type Props = {
  title: string;
  Actions?: Component;
  actionProps?: Record<string, any>;
  Info?: Component;
  fields?: FormField;
  errors?: Writable<Record<string, Record<string, string | string[]>>>;
  entity: string;
  resourceType: ResourceType;
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
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form, posted } = getForm(entity, resourceType);

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
          {#if error && fields?.[fieldId] && error['_errors'] && error['_errors'].length > 0}
            {#each error['_errors'] as message}
              <div class="badge badge-error badge-lg p-3 font-mono text-base-content">
                {message}
              </div>
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
    {#if Actions}
      <div class="flex items-center gap-6">
        <Actions
          bind:searchMode={actionProps.searchMode}
          bind:removeMode={actionProps.removeMode}
          {entity} {resourceType} />
      </div>
    {/if}
    {#if Info}
      <div class="flex items-center gap-6">
        <Info {entity} {resourceType}/>
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
    itemRef="id"
    {entity}
    {resourceType} />
</div>
