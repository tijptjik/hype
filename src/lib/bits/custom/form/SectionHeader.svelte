<script lang="ts">
import { SimpleTooltip } from '#lib/bits/core/index.js'
import { m } from '#lib/i18n.js'
import Header from '#lib/bits/custom/header/Header.svelte'
import * as SectionHeaderPrimitive from './src/sectionHeader/components'
import type { SectionHeaderProps } from './sectionHeader.types'
import Expand from 'virtual:icons/proicons/full-screen-maximize'
import Shrink from 'virtual:icons/proicons/full-screen-minimize'
import Eye from 'virtual:icons/proicons/eye'
import EyeOff from 'virtual:icons/proicons/eye-off'

let {
  title,
  showControlLabels = false,
  icon,
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
  afterControls,
  class: className = '',
}: SectionHeaderProps = $props()

const rootClass = $derived(
  [
    'bits-form__section-header',
    showControlLabels
      ? 'h-auto! grid-cols-1! gap-y-2 py-3! lg:grid-cols-[minmax(0,1fr)_auto]!'
      : '',
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
const CollapsableToggleIcon = $derived(isCollapsableCollapsed ? Expand : Shrink)
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
        {icon}
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

  <div
    class={`bits-form__section-header-right ${showControlLabels ? '[container-type:normal] flex-wrap justify-start! lg:justify-end!' : ''}`}
  >
    {#if right}
      {@render right()}
    {:else}
      {#each actions as action, index (action.key ??
        `${action.text ?? 'action'}-${index}`)}
        <SectionHeaderPrimitive.Action {...action} />
      {/each}

      {#each flags as flag, index (flag.key ?? `${flag.label ?? 'flag'}-${index}`)}
        <SectionHeaderPrimitive.Flag {...flag} />
      {/each}

      {#each triggers as trigger, index (trigger.key ??
        `${trigger.text ?? 'trigger'}-${index}`)}
        <SectionHeaderPrimitive.Trigger {...trigger} />
      {/each}
    {/if}

    {#if onVisibilityToggle}
      <SimpleTooltip disabled={showControlLabels} contentProps={{ role: 'tooltip' }}>
        {#snippet trigger()}
          <SectionHeaderPrimitive.Action
            text={visibilityToggleLabel}
            size="sm"
            style="ghost"
            color="light"
            hideLabel={!showControlLabels}
            hideLabelInstantly={true}
            iconClasses={showControlLabels ? 'size-5! [&_svg]:size-5!' : ''}
            iconComponent={visibilityToggleIcon}
            class={showControlLabels
              ? 'min-h-10 gap-2 px-3 [&_svg]:size-5'
              : 'bits-form__section-header-action-btn'}
            onClick={handleVisibilityToggle}
          />
        {/snippet}
        {visibilityToggleLabel}
      </SimpleTooltip>
    {/if}

    {#snippet collapseControl()}
      {#if onCollapsableToggle}
        <button
          type="button"
          aria-expanded={!isCollapsableCollapsed}
          onclick={handleCollapsableToggle}
          class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
        >
          <CollapsableToggleIcon class="size-4" />
          <span class="grid">
            <!-- Both labels reserve their intrinsic width so toggling never shifts adjacent controls. -->
            <span class="invisible col-start-1 row-start-1" aria-hidden="true">{collapsableExpandLabel ?? m.admin__forms_common_expand()}</span>
            <span class="invisible col-start-1 row-start-1" aria-hidden="true">{collapsableCollapseLabel ?? m.admin__forms_common_collapse()}</span>
            <span class="col-start-1 row-start-1">{collapsableToggleLabel}</span>
          </span>
        </button>
      {/if}
    {/snippet}
    {#if afterControls}
      <div class="flex shrink-0 items-center">
        {@render collapseControl()}
        {@render afterControls()}
      </div>
    {:else}
      {@render collapseControl()}
    {/if}
  </div>
</header>
