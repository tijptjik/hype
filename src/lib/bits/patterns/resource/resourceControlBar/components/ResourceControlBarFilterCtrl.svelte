<script lang="ts">
// BITS
import Button from '$lib/bits/core/button/Button.svelte'
// TYPES
import type { ResourceControlBarFilterCtrlProps } from './resourceControlBarPrimitives.types'

let {
  label,
  icon,
  onHover,
  onClick,
  showMenu = true,
  isCollapsed = false,
  rootElement = $bindable(),
  menuElement = $bindable(),
  activeElement = $bindable(),
  menuContent,
  activeContent,
  class: className = '',
}: ResourceControlBarFilterCtrlProps = $props()
</script>

<div
  class={`bits-resource-filter-bar__filter ${className}`.trim()}
  bind:this={rootElement}
>
  <div class="bits-resource-filter-bar__filter-anchor" onmouseenter={onHover}>
    <Button
      text={label}
      style="outline"
      color="light"
      size="sm"
      class="bits-resource-filter-bar__filter-trigger"
      {onClick}
    >
      {#snippet icon()}
        {#if icon}
          {@const FilterIcon = icon}
          <FilterIcon class="h-6 w-6" />
        {/if}
      {/snippet}
    </Button>
  </div>

  <div class="bits-resource-filter-bar__filter-content">
    {#if showMenu && !isCollapsed}
      <div class="bits-resource-filter-bar__filter-menu" bind:this={menuElement}>
        {#if menuContent}
          {@render menuContent()}
        {/if}
      </div>
    {/if}

    {#if !isCollapsed}
      <div
        class={`bits-resource-filter-bar__filter-active ${showMenu ? 'bits-resource-filter-bar__filter-active--hidden' : ''}`}
        bind:this={activeElement}
      >
        {#if activeContent}
          {@render activeContent()}
        {/if}
      </div>
    {/if}
  </div>
</div>
