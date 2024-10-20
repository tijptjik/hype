<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { getForm } from '$lib/context/forms.svelte';

const { tainted, isTainted, submit } = getForm();

</script>
<button
  class="btn {!isTainted($tainted)
    ? 'btn-outline'
    : 'btn-primary'} disabled:bg-transparent disabled:text-opacity-60"
  onclick={submit}
  disabled={!isTainted($tainted)}>
  {m.forms__save()}
</button>
