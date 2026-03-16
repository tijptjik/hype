<script lang="ts">
import { fade } from 'svelte/transition'
import Icon from '$lib/components/common/Icon.svelte'
import ChevronLeft from 'virtual:icons/lucide/chevron-left'
import ChevronRight from 'virtual:icons/lucide/chevron-right'
import ChevronUp from 'virtual:icons/lucide/chevron-up'
import ChevronDown from 'virtual:icons/lucide/chevron-down'

type Props = {
  direction: 'left' | 'right' | 'up' | 'down'
  onClick?: (e: MouseEvent) => void
  onScroll?: (direction: 'left' | 'right' | 'up' | 'down') => void
  style?: string
}

let { direction, onClick, onScroll, style }: Props = $props()

function handleClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (onClick) {
    onClick(e)
  } else if (onScroll) {
    onScroll(direction)
  }
}

// COMPUTED :: POSITION CLASSES
const positionClasses = $derived(() => {
  switch (direction) {
    case 'left':
      return 'left-8 top-1/2 -translate-y-1/2'
    case 'right':
      return 'right-8 top-1/2 -translate-y-1/2'
    case 'up':
      return 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2'
    case 'down':
      return 'bottom-0 left-1/2 -translate-x-1/2 -translate-y-1/2'
    default:
      return 'left-8 top-1/2 -translate-y-1/2'
  }
})

// COMPUTED :: ICON
const icon = $derived(
  direction === 'left'
    ? ChevronLeft
    : direction === 'right'
      ? ChevronRight
      : direction === 'up'
        ? ChevronUp
        : direction === 'down'
          ? ChevronDown
          : ChevronLeft,
)
</script>

<button
  type="button"
  class="arrow z-40 h-10 w-10 transform rounded-full bg-glass-result p-2 shadow-lg backdrop-blur-sm transition-all hover:bg-glass-result/80 hover:shadow-xl {style
    ? ''
    : 'absolute ' + positionClasses()}"
  style={style || ''}
  onclick={handleClick}
  in:fade={{ duration: 200 }}
  out:fade={{ duration: 200 }}
>
  <Icon src={icon} class="h-6 w-6 stroke-[2px]" />
</button>

<style>
/* Ensure arrows are clickable but don't interfere with content */
button.arrow {
  backdrop-filter: blur(4px);
}
</style>
