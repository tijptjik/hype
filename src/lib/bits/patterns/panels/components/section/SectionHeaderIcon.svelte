<script lang="ts">
import { goto } from '$app/navigation'
import type { Component } from 'svelte'
import Icon from '$lib/components/common/Icon.svelte'

type Props = {
  icon: Component
  iconColorClass: string
  onToggle: (event: MouseEvent) => void
  onNavigate?: (event: MouseEvent) => void
  isNarrow: boolean
  href?: string | null
}

let {
  icon,
  iconColorClass,
  onToggle,
  onNavigate,
  isNarrow,
  href = null,
}: Props = $props()

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
  if (href) {
    onNavigateToIndex(event)
    return
  }

  onToggle(event)
}
</script>

<button
  type="button"
  class="bits-theme bits-panel-section-header-icon"
  class:bits-panel-section-header-icon--narrow={isNarrow}
  onclick={onPrimaryAction}
>
  <Icon
    size="lg"
    src={icon}
    class="bits-panel-section-header-icon__graphic {iconColorClass}"
    aria-hidden="true"
  />
</button>
