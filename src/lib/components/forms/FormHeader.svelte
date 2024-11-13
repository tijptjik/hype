<script lang="ts">
import { slide } from 'svelte/transition';
// COMPONENTS
import { Icon } from '@steeze-ui/svelte-icon';
import { ChevronRight, ExclamationTriangle } from '@steeze-ui/heroicons';
import SearchBar from './FormHeaderSearch.svelte';

// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import type {
  FormField,
  FormFieldArray,
  FormFieldArrayDefinition,
  ResourceType,
  FalsableRef,
  FalsableFacetType
} from '$lib/types';

// TYPES
type Props = {
  title: string;
  subtitle?: string;
  Actions?:
    | Component<{
        searchMode?: boolean;
        removeMode?: boolean;
      }>
    | Component;
  actions?: Record<string, (...args: any[]) => void>;
  actionProps?: Record<string, any>;
  Info?: Component;
  fields?: FormField | FormFieldArray | FormFieldArrayDefinition;
  errors?: Writable<Record<string, Record<string, string | string[]>>>;
  facet?: FalsableFacetType;
  entity: FalsableRef;
  resourceType: ResourceType;
};

// CONFIG

let getWarningMessage = () => {
  console.log('FACET', facet, entity);
  if (facet === 'fields') {
    return 'You are about to be VERY SAD if you accidentally remove a field. ';
  }
  return 'If you remove yourself as member or owner, you will lose edit or access rights respectively';
};

// STATE : PROPS
let {
  title,
  subtitle,
  Actions,
  actionProps = $bindable({
    searchMode: false,
    removeMode: false
  }),
  actions,
  Info,
  fields,
  errors,
  facet,
  entity,
  resourceType
}: Props = $props();

// STATE : CONTEXT
const { form, posted } = getForm(resourceType, entity);

$effect(() => {
  if ($posted) {
    actionProps.searchMode = false;
    actionProps.removeMode = false;
  }
});
</script>

<div class="relative flex flex-col rounded-t-2xl">
  <div class="@container z-10 flex h-20 flex-row justify-between gap-2 rounded-t-2xl bg-base-100 px-6">
    <div class=" flex h-20 items-center gap-4">
      <Icon src={ChevronRight} class="h-6 w-6" />
      <h3 class="text-lg">
        {title}
        <small class="@sm:block hidden pr-3 text-sm text-base-content/50">{subtitle}</small>
      </h3>
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
        {#if resourceType !== 'feature'}
          <Actions
            bind:searchMode={actionProps.searchMode}
            bind:removeMode={actionProps.removeMode}
            {actions}
            {entity}
            {resourceType} />
        {:else}
          <Actions {actions} {entity} {resourceType} />
        {/if}
        {#if Info}
          <div class="flex items-center gap-6">
            <Info {entity} {resourceType} />
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <SearchBar
    bind:searchMode={actionProps.searchMode}
    apiPath="users"
    destination={Object.keys(fields ?? {})[0]}
    {entity}
    {resourceType} />
  {#if actionProps.removeMode}
    <div
      transition:slide={{ duration: 200 }}
      class="alert w-full rounded-none border-0 border-b-4 border-warning">
      <Icon src={ExclamationTriangle} class="h-6 w-6 shrink-0 stroke-current" />
      <span><span class="font-bold text-warning">Warning:</span> {getWarningMessage()}</span>
    </div>
  {/if}
</div>
