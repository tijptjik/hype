<script lang="ts">
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { ChevronRight, ExclamationTriangle } from '@steeze-ui/heroicons';
import Info from '$lib/components/forms/extra/Info.svelte';
import { fade } from 'svelte/transition';
// TYPES
import type { Snippet } from 'svelte';
import type { FormField, FormFieldArray, Form } from '$lib/types';

type HeaderProps = {
  title?: string;
  subtitle?: string;
  form: unknown;
  fields: FormField | FormFieldArray;
  children?: Snippet;
  actionContent?: Snippet;
  infoContent?: Snippet;
};

// STATE : PROPS
let {
  title,
  subtitle,
  form,
  fields,
  children,
  actionContent,
  infoContent
}: HeaderProps = $props();

const { errors } = form as Form;
</script>

{#snippet renderErrorMessages(messages: string[])}
  <div class="flex-grow-2 flex flex-row items-center justify-center gap-2 caret-transparent">
    {#each messages as message}
      <div
        class="badge badge-lg flex items-center justify-center gap-2 truncate border-error p-4 font-mono text-base-content">
        <Icon src={ExclamationTriangle} class="h-4 w-4 shrink-0 stroke-current" />
        <p class="text-sm">{message}</p>
      </div>
    {/each}
  </div>
{/snippet}

<div class="relative flex flex-col rounded-t-2xl">
  <div
    class="flex h-20 flex-row items-center justify-between gap-2 rounded-t-2xl bg-base-100 px-6 @container">
    <div class=" flex h-20 items-center gap-4">
      <Icon src={ChevronRight} class="h-6 w-6" />
      <h3 class="flex-shrink-1 text-lg">
        {title}
        <small class="hidden select-text pr-3 text-sm text-base-content/50 @sm:block"
          >{@html subtitle}</small>
      </h3>
    </div>
    {#if $errors}
      {#each Object.entries($errors) as [key, messagesContainer]}
        {#if messagesContainer}
          {#if key === '_errors' && Array.isArray(messagesContainer) && messagesContainer.length > 0}
            {@render renderErrorMessages(messagesContainer)}
          {:else if key in fields && Array.isArray(messagesContainer) && messagesContainer.length > 0}
            {@render renderErrorMessages(messagesContainer)}
          {:else if key in fields && typeof messagesContainer === 'object' && messagesContainer !== null}
            <!-- Handle nested field errors like userRoles._errors -->
            {#if '_errors' in messagesContainer && Array.isArray(messagesContainer._errors) && messagesContainer._errors.length > 0}
              {@render renderErrorMessages(messagesContainer._errors)}
            {/if}
          {/if}
        {/if}
      {/each}
    {/if}
    {@render children?.()}
    {#if actionContent || infoContent}
      <div class="flex flex-row items-center justify-between gap-4" transition:fade>
        {#if actionContent}
          {@render actionContent?.()}
        {/if}
        {#if infoContent}
          <Info>
            {@render infoContent?.()}
          </Info>
        {/if}
      </div>
    {/if}
  </div>
</div>
