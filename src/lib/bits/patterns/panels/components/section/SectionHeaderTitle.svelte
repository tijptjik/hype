<script lang="ts">
import { goto } from '$app/navigation'
// ICONS
import { Icon } from '$lib/bits'
import ChevronDown from 'virtual:icons/lucide/chevron-down'
import ChevronRight from 'virtual:icons/lucide/chevron-right'

type Props = {
  title: string
  description?: string
  isOpen: boolean
  onToggle: (event: MouseEvent) => void
  onNavigate?: (event: MouseEvent) => void
  href?: string | null
}

let { title, description, isOpen, onToggle, onNavigate, href = null }: Props = $props()

const onNavigateToIndex = (event: MouseEvent): void => {
  if (onNavigate) {
    onNavigate(event)
    return
  }

  if (!href) return

  event.preventDefault()
  void goto(href)
}

const onPrimaryAction = (event: MouseEvent): void => {
  if (onNavigate) {
    onNavigateToIndex(event)
    return
  }

  if (href) {
    onNavigateToIndex(event)
    return
  }

  onToggle(event)
}
</script>

<div class="bits-theme bits-panel-section-header-title">
  <button
    type="button"
    class="bits-panel-section-header-title__chevron-button"
    onclick={onToggle}
    aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${title} section`}
  >
    <Icon
      src={isOpen ? ChevronDown : ChevronRight}
      class="bits-panel-section-header-title__chevron"
    />
  </button>
  <button
    type="button"
    class="bits-panel-section-header-title__action"
    onclick={onPrimaryAction}
    aria-label={`${title} section header`}
  >
    <div class="bits-panel-section-header-title__stack">
      <div class="bits-panel-section-header-title__row">
        <h3 class="bits-panel-section-header-title__heading">{title}</h3>
      </div>
      {#if description}
        <p class="bits-panel-section-header-title__description">{description}</p>
      {/if}
    </div>
  </button>
</div>
