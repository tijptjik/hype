<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
import { fade } from 'svelte/transition'
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
  currentValue: FeatureCardActionDisplay
  currentHoverValue?: FeatureCardActionDisplay
  optimisticValue: FeatureCardActionDisplay
  optimisticHoverValue?: FeatureCardActionDisplay
  settledValue: FeatureCardActionDisplay
  settledHoverValue?: FeatureCardActionDisplay
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
let displayedValue = $state<FeatureCardActionDisplay>(initialCurrentValue)
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
        displayedValue.state === 'check-in'
          ? '[--btn-fg:var(--color-neutral-content)]'
          : '[--btn-fg:var(--color-primary)]',
        '[--btn-hover-fg:var(--color-primary)]',
      ),
)
const shouldShowHoverValue = $derived(!isError && isRootHovered && hasLeftRootAfterSwap)
const visibleValue = $derived(
  isError && errorMessage
    ? ({ key: 'error', label: errorMessage } satisfies FeatureCardActionDisplay)
    : shouldShowHoverValue
      ? getHoverValue(displayedValue)
      : displayedValue,
)
const visibleValueKey = $derived(valueKey(visibleValue))

/**
 * Builds an equality key from the explicit identity and all supplied display fields.
 *
 * @param value Flexible fields for one action phase.
 * @returns Stable key for deciding whether the entire action block needs a new fade.
 */
function valueKey(value: FeatureCardActionDisplay): string {
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${key}:${entry ?? ''}`)
    .join('|')
}

/**
 * Selects hover data for the currently promoted action phase.
 *
 * @param value The promoted base action fields.
 * @returns Hover fields for the same phase, or the base fields when none exist.
 */
function getHoverValue(value: FeatureCardActionDisplay): FeatureCardActionDisplay {
  const promotedKey = valueKey(value)

  if (promotedKey === valueKey(current)) return currentHoverValue ?? value
  if (promotedKey === valueKey(optimistic)) return optimisticHoverValue ?? value
  if (promotedKey === valueKey(settled)) return settledHoverValue ?? value

  return value
}

/**
 * Promotes a base phase and requires a genuine pointer leave before hover copy appears.
 *
 * @param nextValue Current, optimistic, or settled action fields.
 */
function showValue(nextValue: FeatureCardActionDisplay): void {
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
    // Errors restore the settled action phase while the visible unit reports the failure.
    showValue(settled)
    return
  }

  // A new server value is authoritative and remains promoted after this effect reruns.
  if (settledChanged) {
    showValue(settled)
    return
  }

  // Before the server responds, promote the caller's optimistic fields.
  if (optimisticChanged) {
    showValue(optimistic)
    return
  }

  if (currentChanged) showValue(current)
})
</script>

{#snippet visitValue(value: FeatureCardActionDisplay)}
  <div class="flex h-10 min-w-0 flex-col justify-center text-left">
    {#if value.detail}
      <p class="h-4 max-w-full truncate whitespace-nowrap text-xs uppercase">
        {value.label}
      </p>
      <p
        class="mt-1 h-5 max-w-full truncate font-mono text-sm normal-case tracking-normal text-white"
      >
        {value.detail}
      </p>
    {:else}
      <p class="h-4 max-w-full truncate whitespace-nowrap">
        {value.label}
      </p>
    {/if}
  </div>
{/snippet}

{#snippet visitContent(isCollapsed: boolean)}
  <!-- Root: this action consumes only the flex space that remains before the directions portal. -->
  <div class="flex min-w-0 flex-1 items-center gap-2">
    <!-- Icon: stable, fixed-position, and always primary. -->
    <Icon src={Check} class="h-6 w-6 shrink-0 text-primary" />
    {#if !isCollapsed}
      <!-- One keyed transition fades the whole action unit, never its rows independently. -->
      <div class="relative h-10 min-w-0 flex-1">
        {#key visibleValueKey}
          <div class="absolute inset-0" in:fade={{ duration: transitionDuration }}>
            {@render visitValue(visibleValue)}
          </div>
        {/key}
      </div>
    {/if}
  </div>
{/snippet}

<FeatureCardActionButton
  text={visibleValue.label}
  title={visibleValue.label}
  content={visitContent}
  variant="secondary"
  {isIconOnly}
  expandedClass="flex-1 min-w-[9.5rem]"
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
