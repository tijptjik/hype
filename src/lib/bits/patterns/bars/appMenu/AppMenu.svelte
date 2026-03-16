<script lang="ts" generics="T = string">
import Button from '$lib/bits/core/button/Button.svelte'
import { Icon } from '$lib/bits/custom/icon'
import type { AppMenuItem, AppMenuProps } from './appMenu.types'

let {
  items,
  trailingItems = [],
  onSelect,
  class: className = '',
}: AppMenuProps<T> = $props()

let innerHeight = $state(0)
let initialInnerHeight = $state<number | null>(null)

$effect(() => {
  if (initialInnerHeight === null && innerHeight > 0) {
    initialInnerHeight = innerHeight
  }
})

const hasViewportHeightIncreased = $derived(
  initialInnerHeight !== null && innerHeight > initialInnerHeight,
)

function handleSelect(item: AppMenuItem<T>): void {
  onSelect?.(item)
}

const classes = $derived(
  ['bits-theme', 'bits-app-menu', className].filter(Boolean).join(' '),
)
</script>

<svelte:window bind:innerHeight />

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
    hideLabel={hasViewportHeightIncreased}
    class="bits-app-menu__button"
    attrs={{ title: item.label }}
    onClick={() => handleSelect(item)}
  />
{/snippet}

<nav class={classes}>
  <div class="bits-app-menu__inner">
    <div class="bits-app-menu__items">
      {#each items as item (item.label)}
        {@render menuButton(item)}
      {/each}
    </div>

    {#if trailingItems.length > 0}
      <div class="bits-app-menu__trailing">
        {#each trailingItems as item (item.label)}
          {@render menuButton(item)}
        {/each}
      </div>
    {/if}
  </div>
</nav>
