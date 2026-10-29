<script lang="ts">
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
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
      <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx={isGenAI ? 3 : 8} style:rx={isGenAI ? '3px' : '8px'} class="transition-all duration-200 motion-reduce:transition-none" />
        <path d="M12 1v3M2 10v4M22 10v4" style:opacity={isGenAI ? 1 : 0} class="transition-opacity duration-200 motion-reduce:transition-none" />
        <circle cx="8.5" cy="10" r=".7" fill="currentColor" /><circle cx="15.5" cy="10" r=".7" fill="currentColor" />
        <path d={isGenAI ? "M8 15 Q12 15 16 15" : "M8 14 Q12 19 16 14"} style:d={isGenAI ? 'path("M8 15 Q12 15 16 15")' : 'path("M8 14 Q12 19 16 14")'} class="transition-all duration-200 motion-reduce:transition-none" />
      </svg>
    </button>
  {/snippet}
  {tooltip}
</SimpleTooltip>
