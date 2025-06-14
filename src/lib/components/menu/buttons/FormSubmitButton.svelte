<script lang="ts">
// LIB
import { m } from '$lib/i18n';
import { slide } from 'svelte/transition';
// ICONS
import { CheckCircle, ExclamationCircle } from '@steeze-ui/heroicons';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte';
// AUTH
import { useSession } from '$lib/auth/client';
import {
  canManageOrganisations,
  canUpdateOrganisation,
  canUpdateProject,
  canUpdateLayer,
  canManageFeatures
} from '$lib/auth/utils';
// TYPES
import type { Form } from '$lib/types';
import type { SessionUser } from '$lib/types';

let menuProps: { form: Form } = $props();

// STATE : FORM
let { tainted, isTainted, submit, errors } = menuProps.form;

// STATE : UI
let isInvalid = $state(false);
let hasErrors = $state(false);
let buttonElement: HTMLButtonElement = $state()!;
// STATE : EFFECTS
$effect(() => {
  if (Object.keys($errors).length > 0) {
    $inspect('SuperForm Errors', $errors);
  }
  if (menuProps.form.hasClientErrors) {
    $inspect('Clientside Errors', menuProps.form.hasClientErrors);
  }

  // Check for general validation errors
  let hasErrors = (function checkErrors(obj: Record<string, unknown>): boolean {
    if (typeof obj !== 'object' || obj === null) {
      return obj !== undefined;
    }
    return Object.values(obj).some((value) =>
      typeof value === 'object'
        ? checkErrors(value as Record<string, unknown>)
        : value !== undefined
    );
  })($errors as Record<string, unknown>);
  isInvalid = hasErrors || menuProps.form.hasClientErrors;
});

// Global keyboard shortcut for Ctrl+S / Cmd+S
$effect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Check for Ctrl+S (Windows/Linux) or Cmd+S (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); // Prevent browser's default save dialog
      if (buttonElement) {
        buttonElement.click(); // Simulate button click (respects disabled state)
      }
    }
  }

  // Add global event listener
  document.addEventListener('keydown', handleKeyDown);

  // Cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
});
// @ts-ignore - TODO: Fix SuperForm issue
let isDisabled = $derived(!isTainted($tainted) || isInvalid);
</script>

<button
  bind:this={buttonElement}
  transition:slide={{ axis: 'x' }}
  class="btn btn-ghost join-item gap-1 transition-colors duration-500 disabled:bg-transparent disabled:text-opacity-60
  {!isInvalid ? 'text-white' : 'text-black text-opacity-100'}"
  role="button"
  data-testid="formSubmitButton"
  onclick={(e) => submit(e)}
  disabled={isDisabled}>
  <!-- TODO: add saved state -->
  {#if false}{/if}
  {#if !isInvalid}
    <Icon src={CheckCircle} />
    <span>
      {m.forms__save()}
    </span>
  {:else if hasErrors}
    <Icon src={ExclamationCircle} />
    <span>
      {m.forms__invalid()}
    </span>
  {:else}
    <Icon src={ExclamationCircle} />
    <span>
      {m.forms__pending()}
    </span>
  {/if}
</button>
