<script lang="ts">
import type { Component } from 'svelte'
// SERVICES
import { getUrlForResourceIndex } from '$lib/navigation'
// ENUMS
import type { FirstClassResource } from '$lib/enums'
// TYPES
import type { PanelProps } from '$lib/types'
// COMPONENTS
import SectionHeaderRoot from './SectionHeaderRoot.svelte'
import SectionHeaderTitle from './SectionHeaderTitle.svelte'
import SectionHeaderIcon from './SectionHeaderIcon.svelte'

type Props = {
  resourceType?: FirstClassResource
  title: string
  icon: string | Component
  iconGraphicClass?: string
  iconVerticalPaddingClass?: string
  iconColorClass?: string
  description?: string
  isOpen: boolean
  onToggle: (event: MouseEvent) => void
  onNavigate?: (event: MouseEvent) => void
} & PanelProps

let {
  resourceType,
  title,
  icon,
  iconGraphicClass = '',
  iconVerticalPaddingClass = 'py-3',
  iconColorClass = 'text-base-content/60',
  description = undefined,
  isOpen,
  onToggle,
  onNavigate,
  ...panelProps
}: Props = $props()

const DEFAULT_SECTION_HEADER_COLOR_CLASSES = {
  iconColorClass: 'text-base-content/60',
  focusVisibleClass: 'focus-visible:text-primary',
} as const

const SECTION_HEADER_COLOR_CLASS_OVERRIDES: Record<
  string,
  {
    focusVisibleClass: string
  }
> = {
  'text-primary': {
    focusVisibleClass: 'focus-visible:text-primary',
  },
  'text-accent': {
    focusVisibleClass: 'focus-visible:text-accent',
  },
  'text-secondary': {
    focusVisibleClass: 'focus-visible:text-secondary',
  },
}

const SECTION_HEADER_COLOR_CLASSES: Partial<
  Record<
    NonNullable<Props['resourceType']>,
    {
      iconColorClass: string
      focusVisibleClass: string
    }
  >
> = {
  organisation: {
    iconColorClass: 'text-primary',
    focusVisibleClass: 'focus-visible:text-primary',
  },
  project: {
    iconColorClass: 'text-accent',
    focusVisibleClass: 'focus-visible:text-accent',
  },
  layer: {
    iconColorClass: 'text-secondary',
    focusVisibleClass: 'focus-visible:text-secondary',
  },
}

let sectionHeaderColorClasses = $derived(
  (resourceType && SECTION_HEADER_COLOR_CLASSES[resourceType]) ??
    DEFAULT_SECTION_HEADER_COLOR_CLASSES,
)
let focusVisibleClass = $derived(
  SECTION_HEADER_COLOR_CLASS_OVERRIDES[iconColorClass]?.focusVisibleClass ??
    sectionHeaderColorClasses.focusVisibleClass,
)

let isActiveIndexView = $derived(
  resourceType === panelProps.active?.resourceType &&
    panelProps.active?.resourceRef === false,
)

let href = $derived(
  !resourceType ||
    !panelProps.isAdmin ||
    panelProps.panelType !== 'admin' ||
    isActiveIndexView
    ? null
    : getUrlForResourceIndex(resourceType),
)
</script>

<SectionHeaderRoot
  {iconVerticalPaddingClass}
  {focusVisibleClass}
  isNarrow={panelProps.isNarrow}
>
  <div class="bits-panel-section-header">
    {#if !panelProps.isNarrow}
      <SectionHeaderTitle
        {title}
        {description}
        {isOpen}
        {onToggle}
        {onNavigate}
        {href}
      />
    {/if}
    <SectionHeaderIcon
      {icon}
      {iconGraphicClass}
      {iconColorClass}
      {onToggle}
      {onNavigate}
      isNarrow={panelProps.isNarrow}
      {href}
    />
  </div>
</SectionHeaderRoot>
