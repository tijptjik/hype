<script lang="ts">
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import Bot from 'virtual:icons/tabler/robot-face'
import Smile from 'virtual:icons/tabler/mood-smile'
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

<!-- The button owns keyboard focus; the tooltip wrapper must not add a tab stop. -->
<SimpleTooltip
  disabled={!tooltip}
  triggerProps={{ tabindex: -1 }}
  triggerClass="focus-override"
>
  {#snippet trigger()}
    <button
      type="button"
      class={`bits-form__gen-ai focus-override bg-transparent ${className}`}
      {disabled}
      aria-disabled={disabled}
      aria-label={tooltip}
      onclick={handleClick}
    >
      {#if isGenAI}
        <Bot class="h-6 w-6" aria-hidden="true" />
      {:else}
        <Smile class="h-6 w-6" aria-hidden="true" />
      {/if}
    </button>
  {/snippet}
  {tooltip}
</SimpleTooltip>
