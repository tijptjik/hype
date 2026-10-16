<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import type { Component, Snippet } from 'svelte'
// COMPONENTS
import * as Panel from '#lib/bits/patterns/panels/index.js'
// SERVICES
import { navigateOnAdmin } from '#lib/navigation/index.js'
// TYPES
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'
import type { FirstClassResource } from '#lib/enums.js'

// PROPS
let {
  resourceType,
  title,
  rootClass,
  icon,
  iconGraphicClass = '',
  iconVerticalPaddingClass = 'py-3',
  iconColorClass = 'text-base-content/60',
  description = undefined,
  defaultOpen = true,
  children,
  collapsedContent = undefined,
  managedContent = undefined,
  ...panelProps
}: {
  resourceType?: FirstClassResource
  title: string
  rootClass?: string
  icon: string | Component
  iconGraphicClass?: string
  iconVerticalPaddingClass?: string
  iconColorClass?: string
  description?: string
  defaultOpen?: boolean
  children?: Snippet
  collapsedContent?: Snippet
  managedContent?: Snippet<[boolean]>
} & PanelProps = $props()

const adminSettings = $derived(
  panelProps.isAdmin && panelProps.panelType === 'settings',
)
const contentId = $props.id()

// STATE
// Apply the default once so user toggles remain independent of prop updates.
let isOpen = $state(untrack(() => defaultOpen))

const onToggle = (e: MouseEvent) => {
  e.stopPropagation()
  isOpen = !isOpen
}

const onNavigate = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()

  if (panelProps.isAdmin) {
    if (!panelProps.adminCtx || !panelProps.active) {
      return
    }
    if (
      resourceType === panelProps.active.resourceType &&
      panelProps.active.resourceRef === false
    ) {
      onToggle(e)
    } else {
      navigateOnAdmin(panelProps.adminCtx, resourceType ?? false)
    }
  }
}
</script>

<section
  class="bits-theme flex min-h-0 {adminSettings
    ? 'border-b border-border'
    : 'pt-3'} flex-col overflow-hidden bg-panel caret-transparent {isOpen
    ? 'grow-0'
    : 'shrink-0'} {panelProps.position === 'left' && !panelProps.isNarrow
    ? 'pr-4'
    : ''} {rootClass}"
>
  {#if adminSettings}
    <button
      type="button"
      class="flex h-14 w-full shrink-0 items-center gap-4 px-6 text-left text-base-content outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      aria-expanded={isOpen}
      aria-controls={contentId}
      onclick={onToggle}
    >
      {#if typeof icon !== 'string'}
        {@const SectionIcon = icon}
        <SectionIcon class="size-5 shrink-0" aria-hidden="true" />
      {/if}
      <span class="min-w-0 flex-1 text-sm font-normal uppercase tracking-[0.1em]"
        >{title}</span
      >
      <ChevronDown
        class="size-4 text-muted-foreground transition-transform duration-250 motion-reduce:transition-none {isOpen
          ? ''
          : '-rotate-90'}"
      />
    </button>
  {:else}
    <Panel.Section.Header
      {title}
      {icon}
      {iconGraphicClass}
      {iconVerticalPaddingClass}
      {iconColorClass}
      {description}
      {isOpen}
      {onToggle}
      {onNavigate}
      {...panelProps}
    />
  {/if}
  <div id={contentId} class="contents">
    <Panel.Section.Content
      {isOpen}
      {children}
      {collapsedContent}
      {managedContent}
      {...panelProps}
    />
  </div>
</section>
