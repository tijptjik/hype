<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { fade } from 'svelte/transition'
// BITS
import { Icon } from '$lib/bits'
import { cx } from '$lib/bits/utils'
// TYPES
import type { FeatureCardWishlistActionDisplay } from '$lib/types'
// ICONS
import Star from 'virtual:icons/lucide/star'
// LOCAL
import FeatureCardActionButton from './FeatureCardActionButton.svelte'

interface Props {
  currentValue: FeatureCardWishlistActionDisplay
  currentHoverValue?: FeatureCardWishlistActionDisplay
  optimisticValue: FeatureCardWishlistActionDisplay
  optimisticHoverValue?: FeatureCardWishlistActionDisplay
  settledValue: FeatureCardWishlistActionDisplay
  settledHoverValue?: FeatureCardWishlistActionDisplay
  isError?: boolean
  errorMessage?: string
  isIconOnly?: boolean
  onClick?: (event: MouseEvent) => void
}

let {
  currentValue,
  currentHoverValue,
  optimisticValue,
  optimisticHoverValue,
  settledValue,
  settledHoverValue,
  isError = false,
  errorMessage = '',
  isIconOnly,
  onClick,
}: Props = $props()

const transitionDuration = 140
const initialCurrentValue = untrack(() => currentValue)
const initialSettledValue = untrack(() => settledValue)

let isRootHovered = $state(false)
let hasLeftRootAfterSwap = $state(true)
let displayedValue = $state<FeatureCardWishlistActionDisplay>(initialCurrentValue)
let displayedValueKey = $state(valueKey(initialCurrentValue))
let lastCurrentValueKey = $state(valueKey(initialCurrentValue))
let lastOptimisticValueKey = $state(valueKey(initialCurrentValue))
let lastSettledValueKey = $state(valueKey(initialSettledValue))

const current = $derived(currentValue)
const optimistic = $derived(optimisticValue)
const settled = $derived(settledValue)
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
const visibleValue = $derived(
  isError && errorMessage
    ? ({
        key: 'error',
        icon: displayedValue.icon,
        label: errorMessage,
      } satisfies FeatureCardWishlistActionDisplay)
    : shouldShowHoverValue
      ? getHoverValue(displayedValue)
      : displayedValue,
)
const visibleValueKey = $derived(valueKey(visibleValue))

/**
 * Builds an equality key from every display field.
 *
 * @param value Candidate action phase.
 * @returns Stable key used for phase promotion and the label fade.
 */
function valueKey(value: FeatureCardWishlistActionDisplay): string {
  return `${value.key}|${value.icon}:${value.label}`
}

/**
 * Selects hover data for the currently promoted action phase.
 *
 * @param value Promoted base action phase.
 * @returns Hover phase for the same source, or the base phase when absent.
 */
function getHoverValue(
  value: FeatureCardWishlistActionDisplay,
): FeatureCardWishlistActionDisplay {
  const promotedKey = valueKey(value)

  if (promotedKey === valueKey(current)) return currentHoverValue ?? value
  if (promotedKey === valueKey(optimistic)) return optimisticHoverValue ?? value
  if (promotedKey === valueKey(settled)) return settledHoverValue ?? value

  return value
}

/**
 * Promotes a base phase and requires a genuine pointer leave before hover copy appears.
 *
 * @param nextValue Current, optimistic, or settled action phase.
 */
function showValue(nextValue: FeatureCardWishlistActionDisplay): void {
  const nextValueKey = valueKey(nextValue)
  if (nextValueKey === displayedValueKey) return

  displayedValue = nextValue
  displayedValueKey = nextValueKey
  hasLeftRootAfterSwap = false
  isRootHovered = false
}

$effect(() => {
  const currentKey = valueKey(current)
  const optimisticKey = valueKey(optimistic)
  const settledKey = valueKey(settled)
  const currentChanged = currentKey !== lastCurrentValueKey
  const optimisticChanged = optimisticKey !== lastOptimisticValueKey
  const settledChanged = settledKey !== lastSettledValueKey

  lastCurrentValueKey = currentKey
  lastOptimisticValueKey = optimisticKey
  lastSettledValueKey = settledKey

  if (isError) {
    // Errors restore the settled action phase while the visible label reports the failure.
    showValue(settled)
    return
  }

  if (settledChanged) {
    showValue(settled)
    return
  }

  if (optimisticChanged) {
    showValue(optimistic)
    return
  }

  if (currentChanged) showValue(current)
})
</script>

{#snippet wishlistContent(isCollapsed: boolean)}
  <!-- Root: the fixed action slot owns hover colour and never moves the star icon. -->
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <!-- Icon: it changes fill only; its position is independent of the label fade. -->
    <Icon
      src={Star}
      class={cx(
        'h-6 w-6 shrink-0 transition-colors',
        displayedValue.icon ? '[&>path]:fill-current' : '[&>path]:fill-none',
      )}
      filled={displayedValue.icon}
    />
    {#if !isCollapsed}
      <!-- The keyed label remains in normal flow, so it always retains its measured width. -->
      <div class="relative h-4 min-w-0 flex-1 text-left">
        {#key visibleValueKey}
          <div
            class="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
            in:fade={{ duration: transitionDuration }}
          >
            {visibleValue.label}
          </div>
        {/key}
      </div>
    {/if}
  </div>
{/snippet}

<FeatureCardActionButton
  text={visibleValue.label}
  title={visibleValue.label}
  content={wishlistContent}
  variant="ghost"
  {isIconOnly}
  expandedClass="min-w-[10.5rem] max-w-[10.5rem]"
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
