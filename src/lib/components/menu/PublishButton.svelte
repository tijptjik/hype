<script lang="ts">
// LIB
import { NEW_REF } from '$lib';
import { page } from '$app/stores';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getHierarchicalResourceState } from '$lib/context/resources.svelte';
// ENUMS
import { HierarchicalResource, HierarchicalResourcePath } from '$lib/types';
// TYPES
import type { Project, Layer, Feature, SuperFormResult } from '$lib/types';
// STATE : PAGE :: DATA
const { session } = $page.data;

// CONTEXT :: ROUTER
const resourceState = getHierarchicalResourceState();

// STATE : PROPS
let menuProps: { form: SuperFormResult<Project | Layer | Feature> } = $props();

// STATE : FORM
let { form, errors, reset } = menuProps.form;

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

// onMount(async () => await tick());

const handleClick = async (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  if (
    isLoading ||
    !resourceState.activeEntity ||
    resourceState.activeEntity === NEW_REF
  )
    return;

  isLoading = true;

  try {
    const response: Response = await fetch(
      `/api/${HierarchicalResourcePath[resourceState.activeResource]}/${resourceState.activeEntity}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPublished: !$form.isPublished,
          publishedAt: !$form.isPublished ? new Date().toISOString() : null,
          publisherId: !$form.isPublished ? session?.user.id : null
        })
      }
    );

    if (!response.ok) throw new Error('Failed to update publication state');

    const result = await response.json();
    if (result && result?.success) {
      // INVALIDE CACHE
      resourceState.invalidateAndRefresh(
        resourceState.activeResource as HierarchicalResource
      );
      // UPDATE FORM
      form.update(($form) => {
        $form.isPublished = result.data.isPublished;
        $form.publishedAt = result.data.publishedAt;
        $form.publisherId = result.data.publisherId;
        return $form;
      });
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
  class="btn border-none transition-colors duration-500 disabled:bg-transparent disabled:text-opacity-60"
  onclick={handleClick}
  class:bg-rose-500={!isInvalid && !$form.isPublished}
  class:bg-fuchsia-900={!isInvalid && $form.isPublished}
  class:text-white={!isInvalid && $form.isPublished}
  class:btn-outline={isInvalid}
  class:btn-error={isInvalid}
  disabled={isInvalid ||
    isLoading ||
    !resourceState.activeEntity ||
    resourceState.activeEntity === NEW_REF}>
  {#if $form.isPublished}
    {m.forms__unpublish()}
  {:else}
    {m.forms__publish()}
  {/if}
</button>
