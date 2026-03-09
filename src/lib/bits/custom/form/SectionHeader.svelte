<script lang="ts">
import { m } from '$lib/i18n'
import Header from '$lib/bits/custom/header/Header.svelte'
import * as SectionHeaderPrimitive from './src/sectionHeader/components'
import type { SectionHeaderProps } from './sectionHeader.types'
import Expand from 'virtual:icons/lucide/expand'
import Shrink from 'virtual:icons/lucide/shrink'
import Eye from 'virtual:icons/lucide/eye'
import EyeOff from 'virtual:icons/lucide/eye-off'

let {
  title,
  description,
  size = 'sm',
  flags = [],
  actions = [],
  triggers = [],
  onCollapsableToggle,
  isCollapsableCollapsed = false,
  collapsableExpandLabel,
  collapsableCollapseLabel,
  onVisibilityToggle,
  isVisibilityOn = true,
  visibilityOnLabel,
  visibilityOffLabel,
  left,
  center,
  right,
  class: className = '',
}: SectionHeaderProps = $props()

const rootClass = $derived(
  [
    'bits-form__section-header',
    center ? 'bits-form__section-header--with-center' : '',
    className,
  ]
    .filter(Boolean)
    .join(' '),
)

const collapsableToggleLabel = $derived(
  isCollapsableCollapsed
    ? (collapsableExpandLabel ?? m.admin__forms_common_expand())
    : (collapsableCollapseLabel ?? m.admin__forms_common_collapse()),
)
const collapsableToggleIcon = $derived(isCollapsableCollapsed ? Expand : Shrink)
const visibilityToggleLabel = $derived(
  isVisibilityOn
    ? (visibilityOnLabel ?? m.admin__forms_common_hide_unused())
    : (visibilityOffLabel ?? m.admin__forms_common_show_unused()),
)
const visibilityToggleIcon = $derived(isVisibilityOn ? EyeOff : Eye)

const handleCollapsableToggle = (event: MouseEvent): void => {
  onCollapsableToggle?.(!isCollapsableCollapsed, event)
}

const handleVisibilityToggle = (event: MouseEvent): void => {
  onVisibilityToggle?.(!isVisibilityOn, event)
}
</script>

<header class={rootClass}>
  <div class="bits-form__section-header-left">
    {#if left}
      {@render left()}
    {:else if title || description}
      <Header
        text={title}
        {description}
        {size}
        class="bits-form__section-header-heading"
      />
    {/if}
  </div>

  {#if center}
    <div class="bits-form__section-header-center">
      <div class="bits-form__section-header-center-content">{@render center()}</div>
    </div>
  {/if}

  <div class="bits-form__section-header-right">
    {#if right}
      {@render right()}
    {:else}
      {#each actions as action, index (action.key ?? `${action.text ?? 'action'}-${index}`)}
        <SectionHeaderPrimitive.Action {...action} />
      {/each}

      {#each flags as flag, index (flag.key ?? `${flag.label ?? 'flag'}-${index}`)}
        <SectionHeaderPrimitive.Flag {...flag} />
      {/each}

      {#each triggers as trigger, index (trigger.key ?? `${trigger.text ?? 'trigger'}-${index}`)}
        <SectionHeaderPrimitive.Trigger {...trigger} />
      {/each}
    {/if}

    {#if onVisibilityToggle}
      <SectionHeaderPrimitive.Action
        text={visibilityToggleLabel}
        size="sm"
        style="ghost"
        color="light"
        iconComponent={visibilityToggleIcon}
        class="bits-form__section-header-action-btn"
        onClick={handleVisibilityToggle}
      />
    {/if}

    {#if onCollapsableToggle}
      <SectionHeaderPrimitive.Action
        text={collapsableToggleLabel}
        size="sm"
        style="ghost"
        color="light"
        iconComponent={collapsableToggleIcon}
        class="bits-form__section-header-action-btn"
        onClick={handleCollapsableToggle}
      />
    {/if}
  </div>
</header>
