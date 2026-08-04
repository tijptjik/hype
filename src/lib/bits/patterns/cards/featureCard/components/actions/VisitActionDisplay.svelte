<script lang="ts">
// SVELTE
import { onDestroy, tick } from 'svelte'
// BITS
import { Icon } from '$lib/bits'
import { cx } from '$lib/bits/utils'
// TYPES
import type { FeatureCardActionDisplay } from '$lib/types'
// ICONS
import Check from 'virtual:icons/lucide/check'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

interface Props {
  value: FeatureCardActionDisplay
  hoverValue?: FeatureCardActionDisplay
  onClick?: (event: MouseEvent) => void
}

let { value, hoverValue, onClick }: Props = $props()

const crossfadeDuration = 160

let cleanupTimer: ReturnType<typeof setTimeout> | undefined
let transitionFrame: ReturnType<typeof requestAnimationFrame> | undefined
let isInitialised = $state(false)
let isRootHovered = $state(false)
let hasLeftRootAfterSwap = $state(true)
let isCrossfading = $state(false)
let previousValue = $state<FeatureCardActionDisplay | null>(null)
let renderedValue = $state<FeatureCardActionDisplay>({ key: '', label: '' })
let renderedValueKey = $state('')
let baseValueKey = $state('')

const shouldShowHoverValue = $derived(
  isRootHovered && hasLeftRootAfterSwap && Boolean(hoverValue),
)
const targetValue = $derived(shouldShowHoverValue ? (hoverValue ?? value) : value)

/**
 * Clears a pending swap cleanup callback.
 */
function clearCleanupTimer(): void {
  if (!cleanupTimer) return
  clearTimeout(cleanupTimer)
  cleanupTimer = undefined
}

/**
 * Clears a scheduled swap frame.
 */
function clearTransitionFrame(): void {
  if (transitionFrame === undefined) return
  cancelAnimationFrame(transitionFrame)
  transitionFrame = undefined
}

/**
 * Crossfades to a new display value only when its key differs from the rendered one.
 *
 * @param nextValue Desired display value.
 */
function showValue(nextValue: FeatureCardActionDisplay): void {
  if (nextValue.key === renderedValueKey) return

  clearCleanupTimer()
  clearTransitionFrame()
  previousValue = renderedValue
  renderedValue = nextValue
  renderedValueKey = nextValue.key
  isCrossfading = false

  void tick().then(() => {
    transitionFrame = requestAnimationFrame(() => {
      transitionFrame = undefined
      isCrossfading = true
    })
  })

  cleanupTimer = setTimeout(() => {
    previousValue = null
    isCrossfading = false
    cleanupTimer = undefined
  }, crossfadeDuration)
}

$effect(() => {
  if (!isInitialised) {
    renderedValue = value
    renderedValueKey = value.key
    baseValueKey = value.key
    isInitialised = true
    return
  }

  // A changed base state replaces the action under the pointer, so require a real leave again.
  if (value.key !== baseValueKey) {
    baseValueKey = value.key
    hasLeftRootAfterSwap = false
    isRootHovered = false
  }
})

$effect(() => {
  showValue(targetValue)
})

onDestroy(() => {
  clearCleanupTimer()
  clearTransitionFrame()
})
</script>

{#snippet swapItem(item: FeatureCardActionDisplay, isPrevious: boolean)}
  <span
    class={cx(
      'flex min-w-0 flex-col items-start gap-1 text-left leading-none transition-opacity duration-160',
      isPrevious
        ? cx(
            'pointer-events-none absolute inset-x-0 top-0',
            isCrossfading ? 'opacity-0' : 'opacity-100',
          )
        : previousValue && !isCrossfading
          ? 'opacity-0'
          : 'opacity-100',
    )}
    aria-hidden={isPrevious}
  >
    <span class="max-w-full truncate text-xs uppercase">{item.label}</span>
    {#if item.detail}
      <span
        class="max-w-full truncate font-mono text-sm normal-case tracking-normal text-white"
      >
        {item.detail}
      </span>
    {/if}
  </span>
{/snippet}

{#snippet visitContent(isCollapsed: boolean)}
  <!-- Root: this action consumes only the flex space that remains before the directions portal. -->
  <span class="flex min-w-0 flex-1 items-center gap-2">
    <!-- Icon: stable, fixed-position, and always primary. -->
    <Icon src={Check} class="h-6 w-6 shrink-0 text-primary" />
    {#if !isCollapsed}
      <!-- Swap: both items share one fixed-height slot, so neither state can step vertically. -->
      <span class="relative flex min-h-[1.875rem] min-w-0 flex-1 items-start">
        {#if previousValue !== null}
          {@render swapItem(previousValue, true)}
        {/if}
        {@render swapItem(renderedValue, false)}
      </span>
    {/if}
  </span>
{/snippet}

<FeatureCardActionButton
  text={renderedValue.label}
  title={renderedValue.label}
  content={visitContent}
  variant="secondary"
  hideLabelBelow={544}
  expandedClass="flex-1 min-w-0"
  class="justify-start active:scale-100"
  {onClick}
  onMouseEnter={() => {
    isRootHovered = true
  }}
  onMouseLeave={() => {
    hasLeftRootAfterSwap = true
    isRootHovered = false
  }}
  onFocus={() => {
    isRootHovered = true
  }}
  onBlur={() => {
    isRootHovered = false
  }}
/>
