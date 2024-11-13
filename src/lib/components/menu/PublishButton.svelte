<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { CheckCircle } from '@steeze-ui/heroicons';
import { Icon } from '@steeze-ui/svelte-icon';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { ResourceType, FalsableRef } from '$lib/types';

type Props = {
  entity: FalsableRef;
  resourceType: ResourceType;
};

// STATE : PROPS
let { entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { form, errors } = getForm(resourceType, entity);

// STATE : UI
let isInvalid = $state(false);
let isLoading = $state(false);

// STATE : EFFECTS
$effect(() => {
  isInvalid = (function checkErrors(obj: Record<string, unknown>): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return obj !== undefined;
    }
    return Object.values(obj).some((value) =>
      typeof value === 'object'
        ? checkErrors(value as Record<string, unknown>)
        : value !== undefined
    );
  })($errors as Record<string, unknown>);
});

const handleClick = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();

  if (isLoading || !entity || entity === 'new') return;

  isLoading = true;

  try {
    const response = await fetch(`/api/${resourceType}s/${entity}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isPublished: !$form.isPublished,
        publishedAt: !$form.isPublished ? new Date().toISOString() : null
      })
    });

    if (!response.ok) throw new Error('Failed to update publication state');

    const result = await response.json();
    if (result.success) {
      form.update(
        ($form) => {
          $form.isPublished = !$form.isPublished;
          $form.publishedAt = result.data.publishedAt;
          return $form;
        },
        { taint: false }
      );
    }
  } catch (err) {
    console.error(err);
    // TODO: Show error toast
  } finally {
    isLoading = false;
  }
};
</script>

<button
  class="btn transition-all duration-500 disabled:bg-transparent disabled:text-opacity-60"
  onclick={handleClick}
  class:btn-primary={!isInvalid && !$form.isPublished}
  class:btn-secondary={!isInvalid && $form.isPublished}
  class:text-white={!isInvalid && $form.isPublished}
  class:btn-outline={isInvalid}
  class:btn-error={isInvalid}
  class:loading={isLoading}
  disabled={isInvalid || isLoading || !entity || entity === 'new'}>
  {#if $form.isPublished}
    Unpublish
  {:else}
    Publish
  {/if}
</button>
