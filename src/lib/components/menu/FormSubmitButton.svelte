<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { getForm } from '$lib/context/forms.svelte';

const { tainted, isTainted, submit, errors } = getForm();

const hasErrors = (): boolean => Object.keys($errors).length > 0;
</script>

<button
  class="btn disabled:bg-transparent disabled:text-opacity-60"
  onclick={submit}
  class:btn-primary={isTainted($tainted) && !hasErrors()}
  class:btn-outline={!isTainted($tainted) || hasErrors()}
  class:btn-error={hasErrors()}
  disabled={!isTainted($tainted) || hasErrors()}>
  {hasErrors() ? m.forms_invalid() : m.forms__save()}
</button>
