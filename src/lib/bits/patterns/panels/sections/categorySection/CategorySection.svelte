<script lang="ts">
// TRANSITIONS
import { slide } from 'svelte/transition'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import ChevronRight from 'virtual:icons/proicons/chevron-right'
import { Icon } from '#lib/bits/index.js'
import SelectedFilter from '#lib/bits/patterns/panels/components/items/SelectedFilter.svelte'
// TYPES
import type { Component } from 'svelte'
import type { Snippet } from 'svelte'

const toggle = () => {
  isOpen = !isOpen
}

type Props = {
  children: Snippet
  title: string
  icon: string | Component
  iconVerticalPaddingClass: string
  iconColorClass: string
  selectedSummary: string
  hasActiveFilters: boolean
  isOpen: boolean
  hierarchy: {
    organisation?: string | null
    project?: string | null
    layer?: string | null
    layerId: string
  }
}

let {
  children,
  title,
  icon,
  iconVerticalPaddingClass,
  iconColorClass,
  selectedSummary,
  hasActiveFilters,
  isOpen = false,
  hierarchy,
}: Props = $props()
</script>

<div
  class="mt-4 flex min-h-0 shrink-0 flex-col border-t-4 border-base-300 caret-transparent {isOpen
    ? 'flex-grow'
    : ''} {hasActiveFilters ? 'pb-[80px]' : ''}"
  transition:slide
>
  <button
    type="button"
    class="flex w-full shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} bg-panel pb-2 focus:outline-none focus:ring-0 focus-visible:text-primary"
    onclick={toggle}
  >
    <div class="flex items-center gap-3">
      <Icon src={isOpen ? ChevronDown : ChevronRight} class="h-4.5 w-4.5" />
      <!-- Hierarchy path -->
      <div class="flex flex-col space-y-1">
        <div class="flex space-x-0.5 font-mono text-xs uppercase tracking-widest">
          {#if hierarchy?.organisation}
            <span class="px-0 text-primary">{hierarchy.organisation}</span>
          {/if}
          {#if hierarchy?.project}
            <span class="px-0">›</span>
            <span class="text-accent">{hierarchy.project.replaceAll('_', '')}</span>
          {/if}
          {#if hierarchy?.layer}
            <span class="px-0">›</span>
            <span class="text-secondary">{hierarchy.layer.replaceAll(' ', '')}</span>
          {/if}
        </div>
        <!-- Title row -->
        <div class="flex items-center gap-2">
          <h3 class="text-sm uppercase tracking-widest">{title}</h3>
        </div>
      </div>
    </div>
    {#if typeof icon === 'string'}
      <img
        src={icon}
        alt=""
        class="h-12 -translate-x-0.5 translate-y-2 text-base-content/60"
        aria-hidden="true"
      >
    {:else}
      <Icon
        src={icon}
        class="h-12 w-8 {iconColorClass} translate-y-4"
        aria-hidden="true"
      />
    {/if}
  </button>

  {#if isOpen}
    {@render children()}
  {:else}
    <SelectedFilter text={selectedSummary} />
  {/if}
</div>
