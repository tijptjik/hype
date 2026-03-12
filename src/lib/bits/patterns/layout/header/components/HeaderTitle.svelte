<script lang="ts">
// BITS COMPONENTS
import { Header as BitsHeader } from '$lib/bits/custom'
import { Dropdown } from '$lib/bits/core'
// SVELTE
import { slide } from 'svelte/transition'
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

const menuItems = $derived(menuAction?.items ?? [])
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
    <div
      class="bits-pattern-header__title-menu-slot"
      in:slide={{ axis: "x", duration: 260 }}
      out:slide={{ axis: "x", duration: 260 }}
    >
      <Dropdown
        ariaLabel={menuAction.ariaLabel ?? text ?? 'Header menu'}
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
    </div>
  {/if}
</div>
