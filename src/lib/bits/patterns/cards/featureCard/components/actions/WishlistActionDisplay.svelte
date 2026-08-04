<script lang="ts">
// SVELTE
import { onDestroy, tick } from 'svelte'
// BITS
import { Icon } from '$lib/bits'
import { cx } from '$lib/bits/utils'
// ICONS
import Star from 'virtual:icons/lucide/star'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

type WishlistDisplayValue = {
  icon: boolean
  value: string
  hoverValue: string
}

interface Props {
  currentIcon: boolean
  optimisticIcon: boolean
  settledIcon: boolean
  currentValue: string
  currentHoverValue: string
  optimisticValue: string
  optimisticHoverValue: string
  settledValue: string
  settledHoverValue: string
  isError?: boolean
  errorMessage?: string
  onClick?: (event: MouseEvent) => void
}

let {
  currentIcon,
  optimisticIcon,
  settledIcon,
  currentValue,
  currentHoverValue,
  optimisticValue,
  optimisticHoverValue,
  settledValue,
  settledHoverValue,
  isError = false,
  errorMessage = '',
  onClick,
}: Props = $props()

const crossfadeDuration = 160

let labelCleanupTimer: ReturnType<typeof setTimeout> | undefined
let labelFrame: ReturnType<typeof requestAnimationFrame> | undefined
let isRootHovered = $state(false)
let hasLeftRootAfterSwap = $state(true)
let isLabelCrossfading = $state(false)
let previousLabel = $state<string | null>(null)
let isInitialised = $state(false)
let displayedLabel = $state('')
let displayedValue = $state<WishlistDisplayValue>({
  icon: false,
  value: '',
  hoverValue: '',
})
let displayedValueKey = $state('')
let lastSettledValueKey = $state('')

const current = $derived<WishlistDisplayValue>({
  icon: currentIcon,
  value: currentValue,
  hoverValue: currentHoverValue,
})
const optimistic = $derived<WishlistDisplayValue>({
  icon: optimisticIcon,
  value: optimisticValue,
  hoverValue: optimisticHoverValue,
})
const settled = $derived<WishlistDisplayValue>({
  icon: settledIcon,
  value: settledValue,
  hoverValue: settledHoverValue,
})
const rootButtonTone = $derived(
  isError
    ? '[--btn-fg:var(--color-error)] [--btn-hover-fg:var(--color-error)]'
    : cx(
        displayedValue.icon
          ? '[--btn-fg:var(--color-primary)]'
          : '[--btn-fg:var(--color-neutral-content)]',
        '[--btn-hover-fg:var(--color-primary)]',
      ),
)
const shouldShowHoverValue = $derived(!isError && isRootHovered && hasLeftRootAfterSwap)
const targetLabel = $derived(
  isError && errorMessage
    ? errorMessage
    : shouldShowHoverValue
      ? displayedValue.hoverValue
      : displayedValue.value,
)

/**
 * Builds the equality key used to decide whether a visual state needs a new crossfade.
 *
 * @param value Candidate display state.
 * @returns Stable visual-state key.
 */
function valueKey(value: WishlistDisplayValue): string {
  return `${value.icon}:${value.value}:${value.hoverValue}`
}

/**
 * Clears a pending label-transition cleanup callback.
 */
function clearLabelCleanupTimer(): void {
  if (!labelCleanupTimer) return
  clearTimeout(labelCleanupTimer)
  labelCleanupTimer = undefined
}

/**
 * Clears a scheduled label-transition frame.
 */
function clearLabelFrame(): void {
  if (labelFrame === undefined) return
  cancelAnimationFrame(labelFrame)
  labelFrame = undefined
}

/**
 * Crossfades only when the rendered label has genuinely changed.
 *
 * @param nextLabel Label that should replace the visible one.
 */
function showLabel(nextLabel: string): void {
  if (nextLabel === displayedLabel) return

  clearLabelCleanupTimer()
  clearLabelFrame()
  previousLabel = displayedLabel
  displayedLabel = nextLabel
  isLabelCrossfading = false

  void tick().then(() => {
    labelFrame = requestAnimationFrame(() => {
      labelFrame = undefined
      isLabelCrossfading = true
    })
  })

  labelCleanupTimer = setTimeout(() => {
    previousLabel = null
    isLabelCrossfading = false
    labelCleanupTimer = undefined
  }, crossfadeDuration)
}

/**
 * Promotes a visual state into the stable display without animating equal values.
 *
 * @param nextValue Candidate action state.
 */
function showValue(nextValue: WishlistDisplayValue): void {
  const nextValueKey = valueKey(nextValue)
  if (nextValueKey === displayedValueKey) return

  displayedValue = nextValue
  displayedValueKey = nextValueKey
  hasLeftRootAfterSwap = false
  isRootHovered = false
}

$effect(() => {
  const settledValueKey = valueKey(settled)

  if (!isInitialised) {
    displayedValue = current
    displayedValueKey = valueKey(current)
    lastSettledValueKey = settledValueKey
    displayedLabel = current.value
    isInitialised = true
    return
  }

  if (isError) {
    // Errors immediately restore the server-known state while the label explains the failure.
    lastSettledValueKey = settledValueKey
    showValue(settled)
    return
  }

  // A new server value is authoritative. It replaces an optimistic display only when it differs.
  if (settledValueKey !== lastSettledValueKey) {
    lastSettledValueKey = settledValueKey
    showValue(settled)
    return
  }

  // Until the server responds, show the requested optimistic state over the last settled value.
  if (valueKey(optimistic) !== lastSettledValueKey) {
    showValue(optimistic)
    return
  }

  showValue(current)
})

$effect(() => {
  showLabel(targetLabel)
})

onDestroy(() => {
  clearLabelCleanupTimer()
  clearLabelFrame()
})
</script>

{#snippet wishlistContent(isCollapsed: boolean)}
  <!-- Root: the fixed action slot owns hover colour and never moves the star icon. -->
  <span class="flex min-w-0 flex-1 items-center gap-2">
    <!-- Icon: it changes fill only; its position is independent of the label swap. -->
    <Icon
      src={Star}
      class={cx(
        'h-6 w-6 shrink-0 transition-colors',
        displayedValue.icon ? '[&>path]:fill-current' : '[&>path]:fill-none',
      )}
      filled={displayedValue.icon}
    />
    {#if !isCollapsed}
      <!-- Swap: a left-aligned, stacked A/B crossfade for the label only. -->
      <span class="relative flex min-w-0 flex-1 justify-start text-left">
        {#if previousLabel !== null}
          <!-- SwapItem A: the outgoing label is removed after the crossfade completes. -->
          <span
            class={cx(
              'pointer-events-none absolute left-0 whitespace-nowrap transition-opacity duration-160',
              isLabelCrossfading ? 'opacity-0' : 'opacity-100',
            )}
            aria-hidden="true"
          >
            {previousLabel}
          </span>
        {/if}
        <!-- SwapItem B: the incoming label occupies the same left-aligned anchor. -->
        <span
          class={cx(
            'relative whitespace-nowrap transition-opacity duration-160',
            previousLabel && !isLabelCrossfading ? 'opacity-0' : 'opacity-100',
          )}
        >
          {displayedLabel}
        </span>
      </span>
    {/if}
  </span>
{/snippet}

<FeatureCardActionButton
  text={displayedLabel}
  title={displayedLabel}
  content={wishlistContent}
  variant="ghost"
  hideLabelBelow={544}
  expandedClass="min-w-[9.5rem] max-w-[9.5rem]"
  class={cx('justify-start active:scale-100', rootButtonTone)}
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
