<script lang="ts">
import type { FormLabelErrorProps } from '../types'

let { error, class: className = '' }: FormLabelErrorProps = $props()

const messages = $derived.by(() => {
  if (!error) return []
  if (Array.isArray(error)) return error.filter(Boolean)
  return [error]
})
</script>

{#if messages.length > 0}
  <div class={`bits-form__error ${className}`}>{messages.join(' ')}</div>
{/if}
