<script lang="ts">
// LIB
import * as m from '$lib/paraglide/messages.js';
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
  {isInvalid ? m.forms_invalid() : m.forms__save()}
</button>
