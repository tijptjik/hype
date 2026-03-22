<script lang="ts" generics="T = string">
// COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import { Icon } from '$lib/bits/custom/icon'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// STYLES
import {
  APP_MENU_ITEM_GRID_CLASSES,
  APP_MENU_NAV_PANEL_CLASSES,
  APP_MENU_TRAILING_ITEMS_CLASSES,
  getAppMenuButtonClasses,
  getAppMenuNavClasses,
  getAppMenuNavStyles,
} from './appMenu.styles'
// TYPES
import type { AppMenuItem, AppMenuProps } from './appMenu.types'
import {
  getAppMenuHideLabelBelow,
  isCompactAppMenuViewport,
  isMobile,
} from './appMenu.constants'

let {
  items,
  trailingItems = [],
  onSelect,
  offsetX = 0,
  class: className = '',
}: AppMenuProps<T> = $props()

// CONTEXT
const responsiveCtx = getResponsiveCtx()

// RESPONSIVENESS
const availableWidth = $derived(responsiveCtx.window.width)
const availableHeight = $derived(responsiveCtx.window.height)
const hideLabelBelow = $derived(getAppMenuHideLabelBelow(availableWidth))
const isMobileMenu = $derived(isMobile(availableWidth))
const isCompactMobileMenu = $derived(
  isCompactAppMenuViewport(availableWidth, availableHeight),
)

// STYLES
const menuButtonClasses = $derived(getAppMenuButtonClasses(isCompactMobileMenu))
const navClasses = $derived(getAppMenuNavClasses(isCompactMobileMenu, className))
const navStyles = $derived(getAppMenuNavStyles(items.length, offsetX))

// HANDLERS
function handleSelect(item: AppMenuItem<T>): void {
  onSelect?.(item)
}
</script>

{#snippet menuButton(item: AppMenuItem<T>)}
  {#snippet itemIcon()}
    <Icon src={item.icon} size="lg" tone="inherit" strokeWidth={2} />
  {/snippet}
  <Button
    text={item.label}
    icon={itemIcon}
    style="transparent"
    color={item.tone === 'secondary' ? 'secondary' : 'neutral'}
    size="md"
    hideLabel={isCompactMobileMenu}
    {hideLabelBelow}
    {availableWidth}
    class={menuButtonClasses}
    labelClasses="text-xs uppercase tracking-wider"
    iconClasses={isMobileMenu ? 'text-primary' : ''}
    attrs={{ title: item.label }}
    onClick={() => handleSelect(item)}
  />
{/snippet}

<nav class={navClasses} style={navStyles}>
  <div class={APP_MENU_NAV_PANEL_CLASSES}>
    <div class={APP_MENU_ITEM_GRID_CLASSES}>
      {#each items as item (item.label)}
        {@render menuButton(item)}
      {/each}
    </div>

    {#if trailingItems.length > 0}
      <div class={APP_MENU_TRAILING_ITEMS_CLASSES}>
        {#each trailingItems as item (item.label)}
          {@render menuButton(item)}
        {/each}
      </div>
    {/if}
  </div>
</nav>
