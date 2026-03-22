<script lang="ts">
import type { MainFormProps } from './main.types'

let {
  children,
  class: className = '',
  attrs = {},
  formEl = $bindable<HTMLFormElement | undefined>(),
  isReady = true,
}: MainFormProps = $props()

const formClass = $derived(['bits-theme', className].filter(Boolean).join(' '))
const formAttrs = $derived(attrs ?? {})

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  if (!(event.ctrlKey || event.metaKey)) return
  if (event.isComposing) return

  event.preventDefault()
  formEl?.requestSubmit()
}
</script>

{#if isReady}
  <form bind:this={formEl} {...formAttrs} class={formClass} onkeydown={handleKeyDown}>
    {@render children?.()}
  </form>
{/if}
