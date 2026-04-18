<script lang="ts">
import { afterNavigate } from '$app/navigation'
// SVELTE
import { cubicOut } from 'svelte/easing'
import { slide } from 'svelte/transition'
import { tick } from 'svelte'
import Portal from 'svelte-portal'
// I18N
import { getI18n } from '$lib/i18n'
// ICONS
import Funnel from 'virtual:icons/lucide/filter'
import XMark from 'virtual:icons/lucide/x'
import { Icon } from '$lib/bits'
// COMPONENTS
import ResourceHierarchyPath from '$lib/components/panels/common/ResourceHierarchyPath.svelte'
// CONTEXT
import { getAppCtx } from '$lib/context/app.svelte'
// ENUMS
import type { FirstClassResource } from '$lib/enums'
// TYPES
import type { PanelProps, Neighbourhood, Resource } from '$lib/types'

let pendingFocusRestoreKey: string | null = null

const appCtx = getAppCtx()

type Props = {
  resourceType: FirstClassResource | 'neighbourhood'
  resource: {
    id: string
    i18n?: Record<string, unknown> | null
  }
  hierarchy?: { organisation?: unknown; project?: unknown; layer?: unknown }
  selectedClass?: string
  isSelected: boolean
  onToggle: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
  onNavigate?: (event: MouseEvent | KeyboardEvent) => void | Promise<void>
} & PanelProps

const {
  resourceType,
  resource,
  hierarchy = {},
  selectedClass = 'bg-blue-400',
  isSelected,
  onNavigate,
  onToggle,
  ...panelProps
}: Props = $props()

let name = $derived(
  getI18n(resource as Resource | Neighbourhood, 'name', appCtx.getUserPreferences()),
)
let isCurrentActive = $derived(
  panelProps.active?.resourceId === resource.id &&
    panelProps.active?.resourceType === resourceType,
)
let colorTone = $derived(
  selectedClass === 'bg-primary'
    ? 'primary'
    : selectedClass === 'bg-accent'
      ? 'accent'
      : selectedClass === 'bg-secondary'
        ? 'secondary'
        : 'neutral',
)
let itemSlideDuration = $derived(panelProps.isAdmin && panelProps.isNarrow ? 0 : 200)
let focusRestoreKey = $derived(
  `${panelProps.panelType}:${resourceType}:${resource.id}:${panelProps.isNarrow ? 'narrow' : 'wide'}`,
)

let buttonEl: HTMLDivElement
let toolTipActive = $state(false)
let tooltipPosition = $state({ left: 0, top: 0, width: 0, height: 0 })

function tooltipShift(
  _node: Element,
  params: { duration?: number; offsetX?: number } = {},
): {
  duration: number
  easing: typeof cubicOut
  css: (t: number) => string
} {
  const { duration = 160, offsetX = 10 } = params

  return {
    duration,
    easing: cubicOut,
    css: t => `opacity:${t};transform:translateX(${(t - 1) * offsetX}px);`,
  }
}

function showTooltip(): void {
  if (buttonEl && panelProps.isNarrow) {
    toolTipActive = true
    tick().then(() => {
      const rect = buttonEl.getBoundingClientRect()
      tooltipPosition = {
        left: rect.right,
        top: rect.top + rect.height / 2 - 16,
        width: rect.width,
        height: rect.height,
      }
    })
  }
}

function hideTooltip(): void {
  toolTipActive = false
}

async function restoreFocus(): Promise<void> {
  await tick()
  const focusTarget = document.querySelector<HTMLElement>(
    `[data-resource-focus-key="${focusRestoreKey}"]`,
  )
  focusTarget?.focus()
}

afterNavigate(async () => {
  if (pendingFocusRestoreKey !== focusRestoreKey) return

  pendingFocusRestoreKey = null
  await restoreFocus()
})
</script>

<div
  bind:this={buttonEl}
  class="bits-theme group bits-panel-item-resource"
  class:bits-panel-item-resource--narrow={panelProps.isNarrow}
  data-tone={colorTone}
  data-selected={isSelected}
  data-active={isCurrentActive}
  data-resource-focus-key={focusRestoreKey}
  in:slide={{ axis: 'y', duration: itemSlideDuration }}
  out:slide={{ axis: 'y', duration: itemSlideDuration }}
  onclick={panelProps.isAdmin ? onNavigate : onToggle}
  onkeydown={async (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      await onToggle(event)
    } else if (event.key === ' ') {
      event.preventDefault()
      if (isCurrentActive) {
        await onToggle(event)
      } else if (onNavigate) {
        pendingFocusRestoreKey = focusRestoreKey
        await onNavigate(event)
        await restoreFocus()
      } else {
        await onToggle(event)
      }
    } else if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      const section = event.currentTarget.closest('section')
      const input = section?.querySelector('input')
      input?.focus()
    }
  }}
  tabindex="0"
>
  <div
    class="group bits-panel-item-resource__main"
    class:bits-panel-item-resource__main--narrow={panelProps.isNarrow}
    class:bits-panel-item-resource__main--wide={!panelProps.isNarrow}
    onmouseenter={showTooltip}
    onmouseleave={hideTooltip}
    onfocus={showTooltip}
    onblur={hideTooltip}
  >
    {#if panelProps.isNarrow && isCurrentActive && isSelected}
      <Icon
        src={XMark}
        class="bits-panel-item-resource__narrow-close bits-panel-item-resource__narrow-close--active"
        aria-hidden="true"
        onclick={onToggle}
      />
    {:else}
      <div
        onclick={panelProps.isNarrow ? onNavigate : onToggle}
        class="bits-panel-item-resource__dot"
        class:bits-panel-item-resource__dot--hidden={!panelProps.isNarrow && !isSelected && !isCurrentActive}
        class:bits-panel-item-resource__dot--narrow-unselected={panelProps.isNarrow && !isSelected}
        class:bits-panel-item-resource__dot--active={isCurrentActive}
      ></div>
    {/if}

    {#if !panelProps.isNarrow}
      <div class="bits-panel-item-resource__copy">
        <ResourceHierarchyPath {hierarchy} />
        <p
          class="bits-panel-item-resource__name"
          class:bits-panel-item-resource__name--active={isCurrentActive}
        >
          {name}
        </p>
      </div>
    {/if}
  </div>

  {#if !panelProps.isNarrow}
    <div class="bits-panel-item-resource__action" onclick={onToggle}>
      <Icon
        src={isSelected ? XMark : Funnel}
        class="bits-panel-item-resource__action-icon"
        aria-hidden="true"
      />
    </div>
  {/if}
</div>

{#if toolTipActive}
  <Portal target="body">
    <div
      transition:tooltipShift={{ duration: 160, offsetX: 10 }}
      class="bits-theme bits-panel-item-resource__tooltip"
      style="top: {tooltipPosition.top}px; left: {tooltipPosition.left}px;"
    >
      {name}
    </div>
  </Portal>
{/if}
