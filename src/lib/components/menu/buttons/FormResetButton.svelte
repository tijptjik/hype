<script lang="ts">
// I18N
import { m } from '$lib/i18n'
import { slide } from 'svelte/transition'
// LIB
import { invalidateAll } from '$app/navigation'
// COMPONENTS
import Icon from '$lib/components/common/Icon.svelte'
import { XCircle } from '@steeze-ui/heroicons'

// STATE : PROPS
let menuProps = $props()

// STATE : FORM
let { tainted, isTainted } = menuProps.form
</script>

<button
  transition:slide={{ axis: 'x' }}
  class="btn btn-ghost join-item flex flex-row items-center gap-1 overflow-hidden transition-colors duration-500 disabled:bg-transparent disabled:text-opacity-60"
  onclick={() => {
    invalidateAll();
  }}
  disabled={!isTainted($tainted)}
>
  <Icon src={XCircle} class="h-6 w-6" />
  {m.forms__reset()}
</button>
