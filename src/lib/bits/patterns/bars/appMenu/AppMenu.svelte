<script lang="ts" generics="T = string">
// BITS COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import Separator from '$lib/bits/core/separator/Separator.svelte'
import { Icon } from '$lib/bits/custom/icon'

// TYPES
import type { AppMenuItem, AppMenuProps } from './appMenu.types'

let {
  items,
  trailingItems = [],
  onSelect,
  class: className = '',
  style = '',
}: AppMenuProps<T> = $props()

let innerHeight = $state(0)
let innerWidth = $state(0)
let initialInnerHeight = $state<number | null>(null)
let lastInnerWidth = $state<number | null>(null)

$effect(() => {
  if (initialInnerHeight === null && innerHeight > 0) {
    initialInnerHeight = innerHeight
  }
})

$effect(() => {
  if (innerWidth <= 0) {
    return
  }

  if (lastInnerWidth === null) {
    lastInnerWidth = innerWidth
    return
  }

  if (lastInnerWidth !== innerWidth) {
    lastInnerWidth = innerWidth
    initialInnerHeight = innerHeight > 0 ? innerHeight : initialInnerHeight
  }
})

const hasViewportHeightIncreased = $derived(
  initialInnerHeight !== null && innerHeight > initialInnerHeight,
)

const shouldHideLabels = $derived(innerWidth < 1200)

function handleSelect(item: AppMenuItem<T>): void {
  onSelect?.(item)
}

const classes = $derived(
  ['bits-theme', 'bits-app-menu', className].filter(Boolean).join(' '),
)
</script>

<svelte:window bind:innerHeight bind:innerWidth />

{#snippet menuButton(item: AppMenuItem<T>)}
  {#snippet itemIcon()}
    <Icon
      src={item.icon}
      size="lg"
      tone={item.tone === 'secondary' ? 'secondary' : 'primary'}
      strokeWidth={2}
    />
  {/snippet}

  <Button
    text={item.label}
    icon={itemIcon}
    style="ghost"
    color={item.tone === 'secondary' ? 'secondary' : 'neutral'}
    size="md"
    hideLabel={shouldHideLabels}
    class="bits-app-menu__button"
    attrs={{ title: item.label }}
    onClick={() => handleSelect(item)}
  />
{/snippet}

<nav class={classes} {style}>
  <div class="bits-app-menu__inner">
    <div class="bits-app-menu__items">
      {#each items as item (item.label)}
        {@render menuButton(item)}
      {/each}
    </div>

    {#if trailingItems.length > 0}
      <Separator orientation="vertical" decorative class="bits-app-menu__separator" />

      <div class="bits-app-menu__trailing">
        {#each trailingItems as item (item.label)}
          {@render menuButton(item)}
        {/each}
      </div>
    {/if}
  </div>
</nav>
