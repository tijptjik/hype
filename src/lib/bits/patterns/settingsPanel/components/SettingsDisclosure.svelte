<script lang="ts">
// SVELTE
import { slide } from 'svelte/transition'
import { cubicOut } from 'svelte/easing'
import { prefersReducedMotion } from 'svelte/motion'
// PANEL
import { getSectionReveal } from '#lib/bits/patterns/panels/sectionReveal.js'
// ICONS
import ChevronDown from 'virtual:icons/proicons/chevron-down'
// TYPES
import type { Snippet } from 'svelte'

let {
  title,
  open = $bindable(false),
  children,
}: {
  title: string
  open?: boolean
  children: Snippet
} = $props()
const id = $props.id()
const revealSection = getSectionReveal()
let sectionElement: HTMLDivElement
let revealRequested = false

/** Reveals a deliberate expansion after its content reaches full height. @returns Nothing. */
function onExpanded(): void {
  if (!open || !revealRequested) return
  revealRequested = false
  revealSection?.(sectionElement)
}
</script>

<div bind:this={sectionElement}>
  <button
    type="button"
    class="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-base-content focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-focus"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => {
      open = !open
      revealRequested = open
    }}
  >
    <ChevronDown
      class="size-3.5 shrink-0 transition-transform duration-250 motion-reduce:transition-none {open
        ? 'rotate-180'
        : ''}"
    />
    {title}
  </button>
  <div {id} inert={!open}>
    {#if open}
      <div
        onintroend={onExpanded}
        transition:slide={{
          duration: prefersReducedMotion.current ? 0 : 240,
          easing: cubicOut,
        }}
      >
        {@render children()}
      </div>
    {/if}
  </div>
</div>
