<script lang="ts">
// LIB
import { m } from '$lib/i18n';
// ICONS
import { CheckCircle } from '@steeze-ui/heroicons';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
// TYPES
import type { Resource, SuperFormResult } from '$lib/types';

let menuProps: { form: SuperFormResult<Resource> } = $props();

// STATE : FORM
let { tainted, isTainted, submit, errors } = menuProps.form;

// STATE : UI
let isInvalid = $state(false);
let hasErrors = $state(false);
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
</script>

<button
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
  {!isInvalid ? m.forms__save() : hasErrors ? m.forms__invalid() : m.forms__pending()}
</button>
