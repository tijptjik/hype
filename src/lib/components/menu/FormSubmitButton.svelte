<script lang="ts">
// LIB
import { m } from '$lib/i18n';
// ICONS
import { CheckCircle } from '@steeze-ui/heroicons';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// TYPES
import type { Form } from '$lib/types';

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
</script>

<button
  bind:this={buttonElement}
  class="btn transition-all duration-500 disabled:bg-transparent disabled:text-opacity-60"
  role="button"
  data-testid="formSubmitButton"
  onclick={(e) => submit(e)}
  class:btn-primary={isTainted($tainted) && !isInvalid}
  class:bg-rose-500={isTainted($tainted) && !isInvalid}
  class:btn-outline={!isTainted($tainted) || isInvalid}
  class:btn-error={isInvalid}
  disabled={!isTainted($tainted) || isInvalid}>
  <!-- TODO: add saved state -->
  {#if false}
    <Icon src={CheckCircle} />
  {/if}
  {#if !isInvalid}
    {m.forms__save()}
  {:else if hasErrors}
    {m.forms__invalid()}
  {:else}
    {m.forms__pending()}
  {/if}
</button>
