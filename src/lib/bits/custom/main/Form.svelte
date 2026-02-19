<script lang="ts">
import type { MainFormProps } from './main.types'

let {
  children,
  class: className = '',
  attrs = {},
  formEl = $bindable<HTMLFormElement | undefined>(),
  isReady = true,
}: MainFormProps = $props()

const formClass = $derived(
  ['bits-theme', 'space-y-4', className].filter(Boolean).join(' '),
)
</script>

{#if isReady}
  <form bind:this={formEl} {...attrs} class={formClass}>{@render children?.()}</form>
{/if}
