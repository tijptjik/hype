<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import { getForm } from '$lib/context/forms.svelte';
  import { CheckCircle } from '@steeze-ui/heroicons';
  import { Icon } from '@steeze-ui/svelte-icon';

  // STATE : CONTEXT
  const { tainted, isTainted, submit, errors} = getForm();
  
  // STATE : UI
  let isInvalid = $state(false);
  
  // STATE : EFFECTS
  $effect(() => {
    isInvalid = (function checkErrors(obj) {
      if (typeof obj !== 'object' || obj === null) {
        return obj !== undefined;
      }
      return Object.values(obj).some(checkErrors);
    })($errors);
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
