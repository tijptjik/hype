<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { Icon } from '@steeze-ui/svelte-icon';
import { XCircle } from '@steeze-ui/heroicons';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { NavProps, Resource } from '$lib/types';

// STATE : PROPS
let navProps: NavProps = $props();
let { entity, resource } = navProps;

// STATE : CONTEXT
const { tainted, isTainted, reset } = getForm<Resource>(resource, entity);
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
