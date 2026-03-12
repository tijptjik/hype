<script lang="ts">
// BITS COMPONENTS
import { Button } from '$lib/bits/core'
// ICONS
import Funnel from 'virtual:icons/lucide/funnel'
import FunnelX from 'virtual:icons/lucide/funnel-x'
import LayoutGrid from 'virtual:icons/lucide/layout-grid'
import List from 'virtual:icons/lucide/list'
import Table2 from 'virtual:icons/lucide/table-2'
// TYPES
import type { HeaderViewActionsProps } from './headerPrimitives.types'

let {
  showLayoutToggle = true,
  showControlsToggle = true,
  layoutModes = ['card', 'list'],
  layoutMode = 'card',
  controlMode = false,
  hideLabel = false,
  onLayoutToggle,
  onControlsToggle,
}: HeaderViewActionsProps = $props()

const currentIndex = $derived(Math.max(0, layoutModes.indexOf(layoutMode)))
const nextLayoutMode = $derived(
  layoutModes.length > 0
    ? layoutModes[(currentIndex + 1) % layoutModes.length]
    : layoutMode,
)
const layoutText = $derived(
  layoutMode === 'card' ? 'Card' : layoutMode === 'table' ? 'Table' : 'List',
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
    <Button
      text="Filters"
      class="px-4"
      color="neutral"
      style="ghost"
      icon={controlsIcon}
      {hideLabel}
      onClick={() => onControlsToggle?.(!controlMode)}
    />
  {/if}

  {#if showLayoutToggle && layoutModes.length > 1}
    <Button
      text={layoutText}
      class="px-4"
      color="neutral"
      style="ghost"
      icon={nextLayoutMode === 'card' ? cardIcon : nextLayoutMode === 'table' ? tableIcon : listIcon}
      {hideLabel}
      onClick={() => onLayoutToggle?.(nextLayoutMode)}
    />
  {/if}
</div>
