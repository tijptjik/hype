<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
import type { Component, Snippet } from 'svelte'
// COMPONENTS
import * as Panel from '#lib/bits/patterns/panels/index.js'
// SERVICES
import { getSectionReveal } from '#lib/bits/patterns/panels/sectionReveal.js'
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
  headerActions = undefined,
  persistentContent = undefined,
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
  headerActions?: Snippet
  children?: Snippet
  /** Content that stays mounted above the collapsible options. */
  persistentContent?: Snippet
  collapsedContent?: Snippet
  managedContent?: Snippet<[boolean]>
} & PanelProps = $props()

const usesCompactHeader = $derived(
  panelProps.panelType === 'settings' ||
    panelProps.panelType === 'filters' ||
    panelProps.panelType === 'stars',
)
const contentId = $props.id()
const revealSection = getSectionReveal()
let sectionElement: HTMLElement
let revealRequested = false

// STATE
// Apply the default once so user toggles remain independent of prop updates.
let isOpen = $state(untrack(() => defaultOpen))

const onToggle = (e: MouseEvent) => {
  e.stopPropagation()
  isOpen = !isOpen
  revealRequested = isOpen
}

/** Reveals only deliberate expansions after the slide has its final height. @returns Nothing. */
function onExpanded(): void {
  if (!isOpen || !revealRequested) return
  revealRequested = false
  revealSection?.(sectionElement)
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
  bind:this={sectionElement}
  class="bits-theme flex min-h-0 {usesCompactHeader
    ? 'border-b border-border'
    : 'pt-3'} flex-col overflow-hidden bg-panel caret-transparent {isOpen
    ? 'grow-0'
    : 'shrink-0'} {panelProps.position === 'left' && !panelProps.isNarrow
    ? 'pr-4'
    : ''} {rootClass}"
>
  {#if usesCompactHeader}
    <div
      class="flex shrink-0 items-center pr-6 hover:bg-surface focus-within:bg-surface"
    >
      <button
        type="button"
        class="flex h-14 min-w-0 flex-1 items-center gap-4 pl-6 pr-0 text-left text-base-content outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onclick={onToggle}
      >
        {#if typeof icon === 'string'}
          <img src={icon} alt="" class="size-5 shrink-0 object-contain">
        {:else}
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
      {#if headerActions}
        <div class="ml-3 shrink-0">{@render headerActions()}</div>
      {/if}
    </div>
  {:else}
    <Panel.Section.Header
      {title}
      {icon}
      {iconGraphicClass}
      {iconVerticalPaddingClass}
      {iconColorClass}
      {description}
      {headerActions}
      {isOpen}
      {onToggle}
      {onNavigate}
      {...panelProps}
    />
  {/if}
  {#if persistentContent}
    <div class="shrink-0">{@render persistentContent()}</div>
  {/if}
  <div id={contentId} class="contents">
    <Panel.Section.Content
      {isOpen}
      {onExpanded}
      {children}
      {collapsedContent}
      {managedContent}
      {...panelProps}
    />
  </div>
</section>
