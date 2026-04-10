<script lang="ts" generics="T = string">
// COMPONENTS
import Button from '$lib/bits/core/button/Button.svelte'
import { Icon } from '$lib/bits/custom/icon'
import { cx } from '$lib/bits/utils'
// CONTEXT
import { getResponsiveCtx } from '$lib/context/responsive.svelte'
// STYLES
import {
  getAppMenuItemButtonClasses,
  getAppMenuItemGridClasses,
  getAppMenuNavClasses,
  getAppMenuNavPanelClasses,
  getAppMenuNavStyles,
  getAppMenuTrailingItemsClasses,
} from './appMenu.styles'
// TYPES
import type { AppMenuItem, AppMenuProps } from './appMenu.types'
import { getAppMenuBottomGutter, getAppMenuViewportState } from './appMenu.layout'
import { getElevatedChromeXGutter } from '$lib/bits/patterns/bars/omnibar'

let {
  items,
  trailingItems = [],
  onSelect,
  offsetX,
  class: className = '',
}: AppMenuProps<T> = $props()

// CONTEXT
const responsiveCtx = getResponsiveCtx()

// RESPONSIVENESS
const availableWidth = $derived(responsiveCtx.visibleWindowWidth)
const availableHeight = $derived(responsiveCtx.visibleWindowHeight)
const responsiveWidth = $derived(
  responsiveCtx.getEffectiveAppMainWidth() || availableWidth,
)
const resolvedOffsetX = $derived(offsetX ?? responsiveCtx.getAppMainOffsetX())
const viewportState = $derived(
  getAppMenuViewportState(availableWidth, availableHeight, responsiveWidth),
)
const isShortMenu = $derived(viewportState.menuMode === 'shortMenu')
const isTallMenu = $derived(viewportState.menuMode === 'tallMenu')
const isNarrowPillMenu = $derived(viewportState.menuMode === 'narrowPillMenu')
const isWidePillMenu = $derived(viewportState.menuMode === 'widePillMenu')
const isPillMenu = $derived(isNarrowPillMenu || isWidePillMenu)
const defaultButtonColor = $derived(isPillMenu ? 'neutral' : 'primary')

// STYLES
const navClasses = $derived(
  getAppMenuNavClasses(
    viewportState.isIconOnlyMenu,
    isPillMenu,
    viewportState.shouldUseCompactVisualMenu,
    className,
  ),
)
const navPanelClasses = $derived(getAppMenuNavPanelClasses(isPillMenu))
const menuButtonClasses = $derived(
  getAppMenuItemButtonClasses(viewportState.isIconOnlyMenu, isPillMenu),
)
const itemGridClasses = $derived(getAppMenuItemGridClasses(isPillMenu))
const visibleTrailingItems = $derived(
  trailingItems.filter(item => isPillMenu || item.isMobileVisible === true),
)
const mobileItems = $derived(isPillMenu ? items : [...items, ...visibleTrailingItems])
const navItemCount = $derived(isPillMenu ? items.length : mobileItems.length)
const xGutterPx = $derived(isPillMenu ? getElevatedChromeXGutter(responsiveWidth) : 0)
const bottomGutterPx = $derived(
  isPillMenu
    ? getAppMenuBottomGutter(availableWidth, availableHeight, responsiveWidth)
    : 0,
)
const navStyles = $derived(
  getAppMenuNavStyles({
    itemCount: navItemCount,
    offsetX: resolvedOffsetX,
    effectiveWidthPx: responsiveWidth,
    xGutterPx,
    bottomGutterPx,
  }),
)
const trailingItemsClasses = $derived(
  getAppMenuTrailingItemsClasses(
    isPillMenu,
    visibleTrailingItems.some(item => item.isMobileVisible === true),
  ),
)

// HANDLERS
function handleSelect(item: AppMenuItem<T>): void {
  onSelect?.(item)
}

function getItemIconTone(item: AppMenuItem<T>): 'primary' | 'white' | 'secondary' {
  if (!isPillMenu) return 'primary'
  return trailingItems.includes(item) ? 'secondary' : 'white'
}

function getItemIconClasses(item: AppMenuItem<T>): string {
  const baseIconClass =
    isPillMenu && trailingItems.includes(item) ? 'text-secondary' : 'text-white'
  return `${isPillMenu ? `${baseIconClass} transition-[filter,color] duration-150 ease-[ease] group-hover/app-menu-pill:drop-shadow-[0_0_0.55rem_rgba(255,255,255,0.62)] group-focus-visible/app-menu-pill:drop-shadow-[0_0_0.55rem_rgba(255,255,255,0.62)]` : 'text-primary'} ${item.iconClasses ?? ''}`.trim()
}

function getItemButtonClasses(): string {
  return cx(
    menuButtonClasses,
    isPillMenu && 'group/app-menu-pill',
    isPillMenu && 'hover:[--btn-transparent-hover-fg:var(--color-white)]',
    isPillMenu && 'focus-visible:[--btn-transparent-hover-fg:var(--color-white)]',
  )
}

function getItemLabelClasses(item: AppMenuItem<T>): string {
  if (item.hideLabel || viewportState.isIconOnlyMenu) {
    return 'min-w-0 max-h-0 overflow-hidden leading-none'
  }

  if (!isPillMenu) {
    return 'min-w-0 truncate text-xs uppercase tracking-wider text-white'
  }

  const toneClass = trailingItems.includes(item) ? 'text-secondary' : 'text-white'

  return `min-w-0 truncate text-xs uppercase tracking-wider ${toneClass} transition-[filter,color] duration-150 ease-[ease] group-hover/app-menu-pill:drop-shadow-[0_0_0.45rem_rgba(255,255,255,0.52)] group-focus-visible/app-menu-pill:drop-shadow-[0_0_0.45rem_rgba(255,255,255,0.52)]`
}
</script>

{#snippet menuButton(item: AppMenuItem<T>)}
  {#snippet itemIcon()}
    <Icon
      src={item.icon}
      size="lg"
      tone={getItemIconTone(item)}
      strokeWidth={2}
      class="block self-center"
    />
  {/snippet}
  <Button
    text={item.label}
    icon={itemIcon}
    style="transparent"
    color={item.color ?? (item.tone === 'secondary' ? 'secondary' : defaultButtonColor)}
    size="md"
    hideLabel={item.hideLabel || viewportState.isIconOnlyMenu}
    class={getItemButtonClasses()}
    labelClasses={getItemLabelClasses(item)}
    iconClasses={getItemIconClasses(item)}
    attrs={{ title: item.label }}
    onClick={() => handleSelect(item)}
  />
{/snippet}

<nav class={navClasses} style={navStyles}>
  <div class={navPanelClasses}>
    <div class={itemGridClasses}>
      {#each mobileItems as item (item.label)}
        {@render menuButton(item)}
      {/each}
    </div>

    {#if isPillMenu && visibleTrailingItems.length > 0}
      <div class={trailingItemsClasses}>
        {#each visibleTrailingItems as item (item.label)}
          {@render menuButton(item)}
        {/each}
      </div>
    {/if}
  </div>
</nav>
