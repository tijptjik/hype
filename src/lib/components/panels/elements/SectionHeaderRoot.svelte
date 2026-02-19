<script lang="ts">
// ENUMS
import type { FirstClassResource } from '$lib/enums'
// TYPES
import type { Snippet } from 'svelte'

let {
  resourceType,
  iconVerticalPaddingClass,
  focusVisibleClass,
  onNavigate,
  onToggle,
  isOpen,
  isNarrow,
  children,
  href,
}: {
  resourceType: FirstClassResource
  iconVerticalPaddingClass: string
  focusVisibleClass: string
  onNavigate: (e: MouseEvent) => void
  onToggle: (e: MouseEvent) => void
  isOpen: boolean
  isNarrow: boolean
  children: Snippet
  href: string
} = $props()
</script>

<a
  class="group flex w-full flex-shrink-0 items-center justify-between px-4 {iconVerticalPaddingClass} {focusVisibleClass} cursor-pointer bg-black text-base-content focus:outline-none focus:ring-0"
  onclick={href ? onNavigate : onToggle}
  {href}
  aria-expanded={isOpen}
  tabindex="0"
>
  {@render children()}
</a>
