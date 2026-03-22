<script lang="ts">
import { goto } from '$app/navigation'
import type { Component } from 'svelte'
import Icon from '$lib/components/common/Icon.svelte'

type Props = {
  icon: string | Component
  iconGraphicClass?: string
  iconColorClass: string
  onToggle: (event: MouseEvent) => void
  onNavigate?: (event: MouseEvent) => void
  isNarrow: boolean
  href?: string | null
}

let {
  icon,
  iconGraphicClass = '',
  iconColorClass,
  onToggle,
  onNavigate,
  isNarrow,
  href = null,
}: Props = $props()

const graphicTypeClass = $derived(
  typeof icon === 'string'
    ? 'bits-panel-section-header-icon__graphic--image'
    : 'bits-panel-section-header-icon__graphic--icon',
)

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

<button
  type="button"
  class="bits-theme bits-panel-section-header-icon"
  class:bits-panel-section-header-icon--narrow={isNarrow}
  onclick={onPrimaryAction}
>
  {#if typeof icon === 'string'}
    <img
      src={icon}
      alt=""
      class="bits-panel-section-header-icon__graphic {graphicTypeClass} {iconGraphicClass} {iconColorClass}"
      aria-hidden="true"
    >
  {:else}
    <Icon
      size="lg"
      src={icon}
      class="bits-panel-section-header-icon__graphic {graphicTypeClass} {iconGraphicClass} {iconColorClass}"
      aria-hidden="true"
    />
  {/if}
</button>
