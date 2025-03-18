<script lang="ts">
import { slide } from 'svelte/transition';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight, ExclamationTriangle } from '@steeze-ui/heroicons';
import SearchBar from './HeaderSearch.svelte';
import Info from '$lib/components/forms/extra/Info.svelte';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// TYPES
import type { Component } from 'svelte';
import type { FieldProps, ActionProps, GetImageAPI, ImageEditRefs } from '$lib/types';

// STATE : CONTEXT :: RESOURCE
const resourceState = getHierarchicalResourceState();

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
  InfoContent,
  Stats,
  fields,
  ...fieldProps
}: FieldProps &
  ActionProps & {
    InfoContent?: Component;
    Stats?: Component;
    refs?: ImageEditRefs;
  } = $props();

// STATE : CONTEXT
let { form, errors, posted } = fieldProps.form;

$effect(() => {
  if ($posted) {
    actionProps.searchMode = false;
    actionProps.removeMode = false;
  }
});

// CONFIG

let getWarningMessage = () => {
  let msg =
    'If you remove yourself as member or owner, you will lose edit or access rights respectively';
  if (resourceState.activeFacet === 'images') {
    msg =
      'Removing images permanently deletes them from cloud storage and is irreversible.';
  } else if (resourceState.activeFacet === 'fields') {
    msg = 'You are about to be VERY SAD if you accidentally remove a field. ';
  }
  return msg;
};
</script>

<div class="relative flex flex-col rounded-t-2xl">
  <div
    class="z-10 flex h-20 flex-row items-center justify-between gap-2 rounded-t-2xl bg-base-100 px-6 @container">
    <div class=" flex h-20 items-center gap-4">
      <Icon src={ChevronRight} class="h-6 w-6" />
      <h3 class="flex-shrink-1 text-lg">
        {title}
        <small class="hidden select-text pr-3 text-sm text-base-content/50 @sm:block"
          >{@html subtitle}</small>
      </h3>
      {#if $errors}
        {#each Object.entries($errors) as [fieldRoot, error]}
          {#if error && fields?.[fieldRoot] && error['_errors'] && error['_errors'].length > 0}
            {#each error['_errors'] as message}
              <div class="badge badge-error badge-lg p-3 font-mono text-base-content">
                {message}
              </div>
            {/each}
          {/if}
        {/each}
      {/if}
    </div>
    {#if Stats}
      <Stats {...fieldProps} />
    {/if}
    {#if Actions}
      <div class="flex flex-shrink-0 items-center gap-6">
        {#if resourceState.activeResource == 'project' && resourceState.activeFacet === 'fields'}
          <Actions bind:removeMode={actionProps.removeMode} />
        {:else if resourceState.activeResource !== 'feature'}
          <Actions
            bind:searchMode={actionProps.searchMode}
            bind:removeMode={actionProps.removeMode} />
        {:else if resourceState.activeFacet === 'core'}
          <Actions {...fieldProps} />
        {:else if resourceState.activeFacet === 'address'}
          <Actions {...fieldProps} {actions} />
        {:else if resourceState.activeFacet === 'images' && title === 'Gallery'}
          <Actions
            bind:removeMode={actionProps.removeMode}
            bind:searchMode={actionProps.searchMode}
            {actions} />
        {:else if resourceState.activeFacet === 'images' && title === 'Viewer'}
          <Actions refs={fieldProps.refs as ImageEditRefs} />
        {/if}
        {#if InfoContent}
          <div class="flex items-center gap-6">
            <Info>
              <InfoContent />
            </Info>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if actionProps.searchMode}
    <SearchBar
      {...fieldProps}
      bind:searchMode={actionProps.searchMode}
      apiPath="users"
      destination={Object.keys(fields ?? {})[0]} />
  {/if}
  {#if actionProps.removeMode}
    <div
      transition:slide={{ duration: 200 }}
      class="alert w-full rounded-none border-0 border-b-4 border-warning">
      <Icon src={ExclamationTriangle} class="h-6 w-6 shrink-0 stroke-current" />
      <span
        ><span class="font-bold text-warning">Warning:</span>
        {getWarningMessage()}</span>
    </div>
  {/if}
</div>
