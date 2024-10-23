<script lang="ts">
import * as m from '$lib/paraglide/messages.js';
import { Icon } from '@steeze-ui/svelte-icon';
import { XCircle } from '@steeze-ui/heroicons';
// CONTEXT
import { getForm } from '$lib/context/forms.svelte';
// TYPES
import type { ResourceType } from '$lib/types';

type Props = {  
  entity: string;
  resourceType: ResourceType;
};

// STATE : PROPS
let { entity, resourceType }: Props = $props();

// STATE : CONTEXT
const { tainted, isTainted, reset } = getForm(entity, resourceType);
</script>
<button
  class="btn {!isTainted($tainted)
    ? 'btn-disabled'
    : 'btn-ghost'} pl-3 pr-4 disabled:bg-transparent disabled:text-opacity-60"
  onclick={reset}
  disabled={!isTainted($tainted)}>
  <Icon src={XCircle} class="h-6 w-6" />
  {m.forms__reset()}
</button>
