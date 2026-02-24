<script lang="ts">
// ICONS
import Icon from '$lib/components/common/Icon.svelte'
import { ChevronDown, ChevronRight } from '@steeze-ui/heroicons'
// TYPES
import type { PanelProps } from '$lib/types'

// PROPS
let {
  title,
  description,
  isOpen,
  onToggle,
  onNavigate = undefined,
  href,
  ...panelProps
} = $props<{
  title: string
  description?: string
  isOpen: boolean
  onToggle: (e: MouseEvent) => void
  onNavigate?: (e: MouseEvent) => void
  href?: string | null
  panelProps: PanelProps
}>()

const onActivate = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  const mouseEvent = event as unknown as MouseEvent
  if (href && onNavigate) {
    onNavigate(mouseEvent)
    return
  }
  onToggle(mouseEvent)
}
</script>

<div class="bits-theme flex items-center gap-3">
  <div class="space-y-0.5">
    <div class="flex items-center gap-3">
      <Icon
        src={isOpen ? ChevronDown : ChevronRight}
        class="h-4.5 w-4.5"
        onclick={onToggle}
      />
      <div
        onclick={href && onNavigate ? onNavigate : onToggle}
        onkeydown={onActivate}
        role="button"
        tabindex="0"
        aria-label={`${title} section header`}
      >
        <h3 class="text-sm uppercase tracking-widest">{title}</h3>
      </div>
    </div>
    {#if description}
      <p class="text-left text-sm text-base-content/60">{description}</p>
    {/if}
  </div>
</div>
