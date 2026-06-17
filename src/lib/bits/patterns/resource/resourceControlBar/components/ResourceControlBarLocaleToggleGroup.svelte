<script lang="ts">
// BITS CORE
import Button from '$lib/bits/core/button/Button.svelte'
import Separator from '$lib/bits/core/separator/Separator.svelte'
// TYPES
import type { ResourceControlBarLocaleToggleGroupProps } from './resourceControlBarPrimitives.types'

let { items = [], class: className = '' }: ResourceControlBarLocaleToggleGroupProps =
  $props()
</script>

<div class={`bits-theme bits-resource-filter-bar__locale-group ${className}`.trim()}>
  <Separator
    orientation="vertical"
    class="bits-resource-filter-bar__locale-group-divider"
  />
  <div class="bits-resource-filter-bar__locale-group-items">
    {#each items as item (item.localeKey)}
      <Button
        text={item.label}
        size="xs"
        color={item.selected ? 'secondary' : 'neutral'}
        style={item.selected ? 'soft' : 'ghost'}
        class={`bits-resource-filter-bar__locale-group-button ${
          item.selected ? 'bits-resource-filter-bar__locale-group-button--active' : ''
        }`.trim()}
        onClick={item.onToggle}
      />
    {/each}
  </div>
  <Separator
    orientation="vertical"
    class="bits-resource-filter-bar__locale-group-divider"
  />
</div>
