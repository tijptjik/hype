<script lang="ts">
import { cx } from '$lib/bits/utils'
import Icon from './Icon.svelte'
import type { LazyIconAnchorProps } from './iconAnchor.types'

let {
  icon,
  loadingIcon = icon,
  children,
  position = 'right',
  open = $bindable(false),
  label = 'Open details',
  class: className = '',
  triggerClass = '',
  contentClass = '',
  loading = false,
  showContent = true,
  onOpenIntent,
}: LazyIconAnchorProps = $props()

const rootClasses = $derived(cx('relative z-30', className))
const triggerClasses = $derived(
  cx(
    'inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-glass-result opacity-70 transition-opacity duration-200 hover:opacity-90',
    triggerClass,
  ),
)
const contentClasses = $derived(
  cx(
    'pointer-events-none absolute bottom-0 z-50 max-w-sm rounded-xl border border-base-50 bg-base-100 p-3 shadow-xl transition-opacity duration-150',
    position === 'left' ? 'left-0' : 'right-0',
    open && showContent ? 'opacity-100' : 'opacity-0',
    contentClass,
  ),
)

function handleOpenIntent(): void {
  open = true
  void onOpenIntent?.()
}

function handleMouseLeave(): void {
  open = false
}

function handleFocusOut(event: FocusEvent): void {
  const nextFocusTarget = event.relatedTarget

  if (!(nextFocusTarget instanceof Node) || !event.currentTarget) {
    open = false
    return
  }

  if (!event.currentTarget.contains(nextFocusTarget)) {
    open = false
  }
}
</script>

<div
  class={rootClasses}
  onmouseenter={handleOpenIntent}
  onmouseleave={handleMouseLeave}
  onfocusin={handleOpenIntent}
  onfocusout={handleFocusOut}
>
  <button type="button" class={triggerClasses} aria-label={label}>
    <Icon
      src={loading ? loadingIcon : icon}
      size="lg"
      strokeWidth={2}
      animation={loading ? 'spin' : 'inherit'}
    />
  </button>

  {#if children}
    <div class={contentClasses}>
      <div class="pointer-events-auto">{@render children()}</div>
    </div>
  {/if}
</div>
