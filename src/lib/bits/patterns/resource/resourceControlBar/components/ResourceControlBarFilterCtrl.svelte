<script lang="ts">
// BITS
import Button from '#lib/bits/core/button/Button.svelte'
// TYPES
import type { ResourceControlBarFilterCtrlProps } from './resourceControlBarPrimitives.types'

let {
  label,
  icon,
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
  <!-- The filter menu changes only on explicit activation, including keyboard clicks. -->
  <div
    class="flex items-center justify-center opacity-70 transition-opacity duration-300 hover:opacity-100"
  >
    <Button
      text={label}
      attrs={{ 'aria-expanded': showMenu && !isCollapsed }}
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

  <div class="relative flex flex-row items-center">
    {#if showMenu && !isCollapsed}
      <div
        class="bg-base-200 absolute z-30 flex h-16 items-center gap-2 whitespace-nowrap"
        bind:this={menuElement}
      >
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
