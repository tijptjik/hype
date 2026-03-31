<script lang="ts">
import type { Component } from 'svelte'
// COMPONENTS
import * as Panel from '$lib/bits/patterns/panels'
// SERVICES
import { navigateOnAdmin } from '$lib/navigation'
// TYPES
import type { PanelProps } from '$lib/types'
import type { FirstClassResource } from '$lib/enums'

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
  children?: any
  collapsedContent?: any
  managedContent?: any
} & PanelProps = $props()

// STATE
let isOpen = $state(defaultOpen)

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
  } else {
  }
}
</script>

<section
  class="bits-theme flex min-h-0 pt-3 flex-col overflow-hidden bg-black caret-transparent {isOpen
    ? 'grow-0'
    : 'shrink-0'} {panelProps.position === 'left' && !panelProps.isNarrow
    ? 'pr-4'
    : ''} {rootClass}"
>
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
  <Panel.Section.Content
    {isOpen}
    {children}
    {collapsedContent}
    {managedContent}
    {...panelProps}
  />
</section>
