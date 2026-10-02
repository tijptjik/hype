<script lang="ts">
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import Bot from 'virtual:icons/proicons/toy-brick'
import Smile from 'virtual:icons/proicons/emoji'
import type { FormGenAIProps } from './types'

let {
  isGenAI,
  disabled = false,
  onToggle,
  class: className = '',
}: FormGenAIProps = $props()

const tooltip = $derived(
  isGenAI ? m.tooltip__machine_translated() : m.tooltip__human_validated(),
)

function handleClick(event: MouseEvent): void {
  if (disabled) return
  event.stopPropagation()
  event.preventDefault()
  onToggle?.(event)
}
</script>

<SimpleTooltip disabled={!tooltip}>
  {#snippet trigger()}
    <button
      type="button"
      class={`bits-form__gen-ai ${className}`}
      {disabled}
      aria-disabled={disabled}
      aria-label={tooltip}
      onclick={handleClick}
    >
      {#if isGenAI}
        <Bot class="mt-1 h-6 w-6" aria-hidden="true" />
      {:else}
        <Smile class="mt-1 h-6 w-6" aria-hidden="true" />
      {/if}
    </button>
  {/snippet}
  {tooltip}
</SimpleTooltip>
