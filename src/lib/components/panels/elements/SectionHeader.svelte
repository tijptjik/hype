<script lang="ts">
import type { Component } from 'svelte'
// SERVICES
import { getUrlForResourceIndex } from '$lib/navigation'
// ICONS
import SectionHeaderRoot from './SectionHeaderRoot.svelte'
import SectionHeaderTitle from './SectionHeaderTitle.svelte'
import SectionHeaderIcon from './SectionHeaderIcon.svelte'
// ENUMS
import type { FirstClassResource } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'

let {
  resourceType,
  title,
  icon,
  iconVerticalPaddingClass = 'py-3',
  iconColorClass = 'text-base-content/60',
  description = undefined,
  isOpen,
  onToggle,
  onNavigate,
  ...panelProps
} = $props<
  {
    resourceType: FirstClassResource
    title: string
    icon: string | Component
    iconVerticalPaddingClass?: string
    iconColorClass?: string
    description?: string
    isOpen: boolean
    onToggle: (e: MouseEvent) => void
    onNavigate?: (e: MouseEvent) => void
  } & PanelProps
>()

let focusVisibleClass = $derived(
  iconColorClass === 'text-secondary'
    ? 'focus-visible:text-secondary'
    : iconColorClass === 'text-accent'
      ? 'focus-visible:text-accent'
      : 'focus-visible:text-primary',
)

let href = $derived(
  !panelProps.isAdmin ||
    panelProps.panelType !== 'admin' ||
    (resourceType === panelProps.active?.resourceType &&
      panelProps.active?.resourceRef === false)
    ? null
    : getUrlForResourceIndex(resourceType),
)
</script>

<SectionHeaderRoot
  {resourceType}
  {iconVerticalPaddingClass}
  {focusVisibleClass}
  {onNavigate}
  {onToggle}
  {isOpen}
  {href}
  {...panelProps}
>
  {#if !panelProps.isNarrow}
    <SectionHeaderTitle
      {resourceType}
      {title}
      {description}
      {isOpen}
      {onToggle}
      {onNavigate}
      {href}
      {...panelProps}
    />
  {/if}
  <SectionHeaderIcon
    {resourceType}
    {icon}
    {iconColorClass}
    {onNavigate}
    {href}
    {...panelProps}
  />
</SectionHeaderRoot>
