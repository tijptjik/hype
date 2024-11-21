<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte';
import { XCircle } from '@steeze-ui/heroicons';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import { getRouterState } from '$lib/context/router.svelte';
import type { EntityRouter } from '$lib/types';

// STATE : CONTEXT :: ROUTER
const { resource, entity } = getRouterState() as EntityRouter;

// STATE : PROPS
let menuProps = $props();

// STATE : FORM
let { tainted, isTainted, reset } = menuProps.form
</script>

<button
  class="btn {!isTainted($tainted as unknown as boolean)
    ? 'btn-disabled'
    : 'btn-ghost'} pl-3 pr-4 disabled:bg-transparent disabled:text-opacity-60"
  onclick={() => reset()}
  disabled={!isTainted($tainted as unknown as boolean)}>
  <Icon src={XCircle} class="h-6 w-6" />
  {m.forms__reset()}
</button>
