<script lang="ts">
// BITS COMPONENTS
import { Header as BitsHeader } from '$lib/bits/custom'
import { Dropdown } from '$lib/bits/core'
// TYPES
import type { HeaderTitleProps } from './headerPrimitives.types'
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'

let {
  text,
  description,
  icon,
  href,
  crumbs = [],
  menuAction = undefined,
  hideTitle = false,
  hideDescription = false,
}: HeaderTitleProps = $props()

const MenuIcon = $derived(menuAction?.icon ?? null)
const menuItems = $derived(
  menuAction
    ? [
        {
          label: menuAction.label,
          onSelect: () => menuAction.onSelect?.(),
          icon: MenuIcon,
          class: 'bits-pattern-header__title-menu-item--danger',
          iconClass: 'bits-pattern-header__title-menu-item-icon',
        },
      ]
    : [],
)
</script>

<div class="bits-pattern-header__title-group">
  <BitsHeader
    size="md"
    {icon}
    {href}
    {crumbs}
    {text}
    {description}
    {hideTitle}
    {hideDescription}
  />

  {#if menuAction?.visible}
    <Dropdown
      ariaLabel={menuAction.label}
      triggerClass="bits-pattern-header__title-menu-trigger"
      triggerIcon={ChevronDown}
      triggerIconClass="bits-pattern-header__title-menu-trigger-icon"
      contentClass="bits-pattern-header__title-menu-content"
      contentSide="bottom"
      contentSideOffset={8}
      contentAlign="center"
      itemClass="bits-pattern-header__title-menu-item"
      items={menuItems}
    />
  {/if}
</div>
