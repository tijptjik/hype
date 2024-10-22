<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { CheckCircle } from '@steeze-ui/heroicons';
  import { Icon } from '@steeze-ui/svelte-icon';
  // CONTEXT
  import { getForm } from '$lib/context/forms.svelte';

  // STATE : PROPS
  let { entity }: { entity: string } = $props();

  // STATE : CONTEXT
  const { tainted, isTainted, submit, errors} = getForm(entity);
  
  // STATE : UI
  let isInvalid = $state(false);
  
  // STATE : EFFECTS
  $effect(() => {
    isInvalid = (function checkErrors(obj: Record<string, unknown>): boolean {
      if (typeof obj !== 'object' || obj === null) {
        return obj !== undefined;
      }
      return Object.values(obj).some((value) => 
        typeof value === 'object' ? checkErrors(value as Record<string, unknown>) : value !== undefined
      );
    })($errors as Record<string, unknown>);
  });
</script>

<button
  class="btn disabled:bg-transparent disabled:text-opacity-60 transition-all duration-500"
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
