<script lang="ts">
// BITS COMPONENTS
import BitsHeader from '$lib/bits/custom/header/Header.svelte'
import { Dropdown } from '$lib/bits/core'
// BITS
import { cx } from '$lib/bits/utils'
// SVELTE
import { slide } from 'svelte/transition'
// TYPES
import type { HeaderTitleProps } from './headerPrimitives.types'
// ICONS
import ChevronDown from 'virtual:icons/lucide/chevron-down'
// STYLES
import {
  HEADER_TITLE_MENU_CONTENT_CLASSES,
  HEADER_TITLE_MENU_ITEM_CLASSES,
  HEADER_TITLE_MENU_SLOT_CLASSES,
  HEADER_TITLE_MENU_TRIGGER_CLASSES,
  HEADER_TITLE_MENU_TRIGGER_ICON_CLASSES,
  HEADER_TITLE_MENU_TRIGGER_PLACEHOLDER_CLASSES,
} from './headerPrimitives.styles'

let {
  text,
  description,
  icon,
  href,
  crumbs = [],
  menuAction = undefined,
  hideTitle = false,
  hideDescription = false,
  isMeasuring = false,
}: HeaderTitleProps = $props()

const menuItems = $derived(menuAction?.items ?? [])
const resolvedCrumbs = $derived(
  crumbs.map(crumb => ({ name: crumb.name, href: crumb.href })),
)
</script>

<div class="bits-pattern-header__title-group">
  <BitsHeader
    size="md"
    {icon}
    {href}
    crumbs={resolvedCrumbs}
    {text}
    {description}
    {hideTitle}
    {hideDescription}
  />

  {#if menuAction?.isVisible}
    <div
      class={HEADER_TITLE_MENU_SLOT_CLASSES}
      in:slide={{ axis: 'x', duration: 260 }}
      out:slide={{ axis: 'x', duration: 260 }}
    >
      {#if isMeasuring}
        <div
          class={cx(
            HEADER_TITLE_MENU_TRIGGER_CLASSES,
            HEADER_TITLE_MENU_TRIGGER_PLACEHOLDER_CLASSES,
          )}
          aria-hidden="true"
        >
          <ChevronDown class={HEADER_TITLE_MENU_TRIGGER_ICON_CLASSES} />
        </div>
      {:else}
        <Dropdown
          ariaLabel={menuAction.ariaLabel ?? text ?? 'Header menu'}
          triggerClass={HEADER_TITLE_MENU_TRIGGER_CLASSES}
          triggerIcon={ChevronDown}
          triggerIconClass={HEADER_TITLE_MENU_TRIGGER_ICON_CLASSES}
          contentClass={HEADER_TITLE_MENU_CONTENT_CLASSES}
          contentSide="bottom"
          contentSideOffset={8}
          contentAlign="center"
          itemClass={HEADER_TITLE_MENU_ITEM_CLASSES}
          items={menuItems}
        />
      {/if}
    </div>
  {/if}
</div>
