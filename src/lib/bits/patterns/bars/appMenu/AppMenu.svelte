<script lang="ts" generics="T = string">
// COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import { Icon } from '$lib/bits/custom/icon'
// BITS
import { cx } from '$lib/bits/utils'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// STYLES
import {
  APP_MENU_ITEM_GRID_CLASSES,
  APP_MENU_NAV_PANEL_CLASSES,
  getAppMenuButtonClasses,
  getAppMenuNavClasses,
  getAppMenuNavStyles,
  getAppMenuTrailingItemsClasses,
} from './appMenu.styles'
// TYPES
import type { AppMenuItem, AppMenuProps } from './appMenu.types'
import { getAppMenuViewportState } from './appMenu.constants'

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
const viewportState = $derived(getAppMenuViewportState(availableWidth, availableHeight))

// STYLES
const navClasses = $derived(
  getAppMenuNavClasses(
    viewportState.isIconOnlyMenu,
    viewportState.shouldUseCompactVisualMenu,
    className,
  ),
)
const menuButtonClasses = $derived(
  getAppMenuButtonClasses(viewportState.isIconOnlyMenu),
)
const visibleTrailingItems = $derived(
  trailingItems.filter(
    item => !viewportState.isMobileMenu || item.isMobileVisible === true,
  ),
)
const mobileItems = $derived(
  viewportState.isMobileMenu ? [...items, ...visibleTrailingItems] : items,
)
const navItemCount = $derived(
  viewportState.isMobileMenu ? mobileItems.length : items.length,
)
const navStyles = $derived(getAppMenuNavStyles(navItemCount, offsetX))
const trailingItemsClasses = $derived(
  getAppMenuTrailingItemsClasses(
    visibleTrailingItems.some(item => item.isMobileVisible === true),
  ),
)

// HANDLERS
function handleSelect(item: AppMenuItem<T>): void {
  onSelect?.(item)
}
</script>

{#snippet menuButton(item: AppMenuItem<T>)}
  {#snippet itemIcon()}
    <Icon
      src={item.icon}
      size="lg"
      tone="inherit"
      strokeWidth={2}
      class="block self-center"
    />
  {/snippet}
  <Button
    text={item.label}
    icon={itemIcon}
    style="transparent"
    color={item.color ?? (item.tone === 'secondary' ? 'secondary' : 'neutral')}
    size="md"
    hideLabel={item.hideLabel || viewportState.isIconOnlyMenu}
    class={menuButtonClasses}
    labelClasses={item.hideLabel || viewportState.isIconOnlyMenu
        ? 'min-w-0 max-h-0 overflow-hidden leading-none'
        : 'min-w-0 truncate text-xs uppercase tracking-wider'}
    iconClasses={cx(
      viewportState.isMobileMenu && !item.color && 'text-primary',
      item.iconClasses,
    )}
    attrs={{ title: item.label }}
    onClick={() => handleSelect(item)}
  />
{/snippet}

<nav class={navClasses} style={navStyles}>
  <div class={APP_MENU_NAV_PANEL_CLASSES}>
    <div class={APP_MENU_ITEM_GRID_CLASSES}>
      {#each mobileItems as item (item.label)}
        {@render menuButton(item)}
      {/each}
    </div>

    {#if !viewportState.isMobileMenu && visibleTrailingItems.length > 0}
      <div class={trailingItemsClasses}>
        {#each visibleTrailingItems as item (item.label)}
          {@render menuButton(item)}
        {/each}
      </div>
    {/if}
  </div>
</nav>
