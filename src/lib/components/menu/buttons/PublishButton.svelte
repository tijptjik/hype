<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition';
// LIB
import { NEW_REF } from '$lib';
import { page } from '$app/state';
// I18N
import { m } from '$lib/i18n';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';
// ICONS
import { EyeSlash } from '@steeze-ui/heroicons';
import { Eye } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// TYPES
import type { Form, HubForm } from '$lib/types';
// STATE : PAGE :: DATA
const { session } = page.data;

// CONTEXT :: ROUTER
const adminCtx = getAdminCtx();

// STATE : PROPS
let menuProps: { form: Exclude<Form, HubForm> } = $props();

// STATE : FORM
let { form, errors, reset, submit, tainted, isTainted } = menuProps.form;

// STATE : UI
let isInvalid = $state(false);
let isLoading = $state(false);

// STATE : EFFECTS
// TODO Replace by runed watch
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
  if (isLoading || !adminCtx.activeEntity || adminCtx.activeEntity === NEW_REF) return;

  isLoading = true;

  try {
    // If form is dirty, submit it first
    // @ts-ignore TODO Superform replace
    if (isTainted($tainted)) {
      submit(e);
      // Note: We proceed regardless of submit result since publish is a separate action
    }

    const response: Response = await fetch(
      `/api/${ResourcePath[adminCtx.activeResource as FirstClassResource]}/${adminCtx.activeEntity}`,
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

    if (result && result.type === 'success') {
      // INVALIDE CACHE
      if (adminCtx.activeResource) {
        adminCtx.invalidateAndRefresh(adminCtx.activeResource);
      }
      // UPDATE FORM - Reset with new data to avoid dirtying the form
      reset({
        keepMessage: true,
        data: {
          ...$form,
          isPublished: result.data.isPublished,
          publishedAt: result.data.publishedAt,
          publisherId: result.data.publisherId
        },
        newState: {
          ...$form,
          isPublished: result.data.isPublished,
          publishedAt: result.data.publishedAt,
          publisherId: result.data.publisherId
        }
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
  transition:slide={{ axis: 'x' }}
  class="btn btn-ghost join-item gap-1 transition-colors duration-500 disabled:bg-transparent disabled:text-opacity-60"
  onclick={handleClick}
  disabled={isInvalid ||
    isLoading ||
    !adminCtx.activeEntity ||
    adminCtx.activeEntity === NEW_REF}>
  {#if $form.isPublished}
    <Icon src={EyeSlash} class="h-5 w-5" />
    {m.forms__unpublish()}
  {:else}
    <Icon src={Eye} class="h-5 w-5" />
    {m.forms__publish()}
  {/if}
</button>
