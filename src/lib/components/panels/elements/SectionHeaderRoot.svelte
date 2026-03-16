<script lang="ts">
// TYPES
import type { Snippet } from 'svelte'

let {
  iconVerticalPaddingClass,
  focusVisibleClass,
  onNavigate,
  onToggle,
  isOpen,
  isNarrow,
  children,
  href,
}: {
  iconVerticalPaddingClass: string
  focusVisibleClass: string
  onNavigate: (e: MouseEvent) => void
  onToggle: (e: MouseEvent) => void
  isOpen: boolean
  isNarrow: boolean
  children: Snippet
  href: string
} = $props()

const onActivate = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  const mouseEvent = event as unknown as MouseEvent
  if (href) {
    onNavigate(mouseEvent)
    return
  }
  onToggle(mouseEvent)
}
</script>

<div
  class="bits-theme group flex w-full shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} {focusVisibleClass} cursor-pointer bg-black text-base-content focus:outline-none focus:ring-0"
  onclick={href ? onNavigate : onToggle}
  onkeydown={onActivate}
  aria-expanded={isOpen}
  tabindex="0"
  role="button"
>
  {@render children()}
</div>
