<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { CheckCircle } from '@steeze-ui/heroicons';
import Icon from '$lib/components/common/Icon.svelte';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
import { getRouterState } from '$lib/context/router.svelte';
// TYPES
import type { EntityRouter, Resource, SuperFormResult } from '$lib/types';

let menuProps: { form: SuperFormResult<Resource> } = $props();

// STATE : CONTEXT :: ROUTER
const routerState = getRouterState() as EntityRouter;

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
  class:btn-outline={!isTainted($tainted) || isInvalid}
  class:btn-error={isInvalid}
  disabled={!isTainted($tainted) || isInvalid}>
  <!-- TODO: add saved state -->
  {#if false}
    <Icon src={CheckCircle} />
  {/if}
  {isInvalid ? m.forms_invalid() : m.forms__save()}
</button>
