<script lang="ts">
import { fly } from 'svelte/transition'
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Funnel from 'virtual:icons/lucide/funnel'
import FunnelX from 'virtual:icons/lucide/funnel-x'
import LayoutGrid from 'virtual:icons/lucide/layout-grid'
import List from 'virtual:icons/lucide/list'
import Table2 from 'virtual:icons/lucide/table-2'
// TYPES
import type { HeaderLayoutMode } from '../header.types'

let {
  showLayoutToggle = true,
  showControlsToggle = true,
  layoutModes = ['card', 'list'],
  layoutMode = 'card',
  controlMode = false,
  hideLabel = false,
  onLayoutToggle,
  onControlsToggle
}: {
  showLayoutToggle?: boolean
  showControlsToggle?: boolean
  layoutModes?: HeaderLayoutMode[]
  layoutMode?: HeaderLayoutMode
  controlMode?: boolean
  hideLabel?: boolean
  onLayoutToggle?: (next: HeaderLayoutMode) => void
  onControlsToggle?: (next: boolean) => void
} = $props()

const currentIndex = $derived(
  Math.max(0, layoutModes.indexOf(layoutMode))
)
const nextLayoutMode = $derived(
  layoutModes.length > 0
    ? layoutModes[(currentIndex + 1) % layoutModes.length]
    : layoutMode
)
const layoutText = $derived(
  layoutMode === 'card' ? 'Card' : layoutMode === 'table' ? 'Table' : 'List'
)
</script>

{#snippet controlsIcon()}
  {#if controlMode}
    <FunnelX />
  {:else}
    <Funnel />
  {/if}
{/snippet}

{#snippet cardIcon()}
  <LayoutGrid />
{/snippet}

{#snippet tableIcon()}
  <Table2 />
{/snippet}

{#snippet listIcon()}
  <List />
{/snippet}

<div class="bits-pattern-header__view-actions">
  {#if showControlsToggle}
    <div
      in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
      out:fly={{ x: 12, duration: 180, opacity: 0.15 }}>
      <Button
        text="Filters"
        class="px-4"
        color="neutral"
        style="ghost"
        icon={controlsIcon}
        {hideLabel}
        onClick={() => onControlsToggle?.(!controlMode)} />
    </div>
  {/if}

  {#if showLayoutToggle && layoutModes.length > 1}
    <div
      in:fly={{ x: -12, delay: 180, duration: 180, opacity: 0.15 }}
      out:fly={{ x: 12, duration: 180, opacity: 0.15 }}>
      <Button
        text={layoutText}
        class="px-4"
        color="neutral"
        style="ghost"
        icon={nextLayoutMode === 'card' ? cardIcon : nextLayoutMode === 'table' ? tableIcon : listIcon}
        {hideLabel}
        onClick={() => onLayoutToggle?.(nextLayoutMode)} />
    </div>
  {/if}
</div>
