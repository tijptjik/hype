<script lang="ts">
// SVELTE
import { tick, untrack } from 'svelte'
import { cubicInOut } from 'svelte/easing'
import { fade, fly } from 'svelte/transition'
import type { AnimationConfig } from 'svelte/animate'
import type { TransitionConfig } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
// ICONS
import GridIcon from 'virtual:icons/proicons/apps'
import CloseIcon from 'virtual:icons/proicons/cancel'
// TYPES
import type { AdminMenuItem } from './adminMenu.types'

let {
  items,
  isNarrow,
  pathname,
}: {
  items: AdminMenuItem[]
  isNarrow: boolean
  pathname: string
} = $props()

let expanded = $state(false)
let retracting = $state(false)
const id = $props.id()
const hasOverflow = $derived(items.length > 5)
const visibleItems = $derived(
  expanded ? items : hasOverflow ? items.slice(0, 4) : items,
)
const destinations = $derived(items.map(item => item.href).join('|'))
const duration = $derived(prefersReducedMotion.current ? 0 : 320)
let trigger = $state<HTMLButtonElement>()
let nav = $state<HTMLElement>()
// The wide bar keeps its fifth slot; the narrow bar keeps its bottom control.
const entries = $derived.by(() => {
  const destinations: { key: string; item: AdminMenuItem | null }[] = visibleItems.map(
    item => ({ key: item.href, item }),
  )
  if (hasOverflow)
    destinations.splice(isNarrow ? destinations.length : 4, 0, {
      key: 'toggle',
      item: null,
    })
  return destinations
})

/** Translate retained icons without the size scaling of the default FLIP animation.
 * @param _node Animated item wrapper.
 * @param bounds Before and after layout rectangles.
 * @returns A translation using the same timing as newly revealed items.
 */
function moveItem(
  _node: Element,
  bounds: { from: DOMRect; to: DOMRect },
): AnimationConfig {
  const x =
    bounds.from.left + bounds.from.width / 2 - bounds.to.left - bounds.to.width / 2
  const y = bounds.from.top - bounds.to.top
  return {
    duration: retracting ? 0 : duration,
    easing: cubicInOut,
    css: t => `transform: translate(${(1 - t) * x}px, ${(1 - t) * y}px)`,
  }
}

/** Reveal additional icons from the footer with full opacity throughout.
 * @param node Newly revealed destination wrapper.
 * @returns An upward translation with no fade or scaling.
 */
function revealItem(node: Element): TransitionConfig {
  const bottom =
    nav?.getBoundingClientRect().bottom ?? node.getBoundingClientRect().bottom
  return fly(node, {
    y: Math.max(0, bottom - 60 - node.getBoundingClientRect().top),
    opacity: 1,
    duration: retracting ? 0 : duration,
    easing: cubicInOut,
  })
}

/** Retract against the expanded geometry before switching back to the compact layout.
 * @param restoreFocus Whether Escape should return focus to the toggle.
 * @returns Completion after the reverse movement and compact layout commit.
 */
async function close(restoreFocus = false): Promise<void> {
  if (!expanded || retracting) return
  retracting = true
  const bounds = nav?.getBoundingClientRect()
  const wrappers = [...(nav?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [])]
  const animations: Animation[] = []
  if (bounds && duration) {
    const firstTop = wrappers[0]?.getBoundingClientRect().top ?? bounds.top
    const narrowExitDistance = bounds.top + 12 - firstTop
    for (const [index, wrapper] of wrappers.entries()) {
      const rect = wrapper.getBoundingClientRect()
      // Retained shortcuts return to their exact compact slots; other views exit below them.
      const isToggle = wrapper.querySelector('button') !== null
      const targetTop = isNarrow
        ? isToggle
          ? rect.top
          : index < 4
            ? bounds.top + 12 + index * 56
            : rect.top + narrowExitDistance
        : bounds.bottom - 60
      animations.push(
        wrapper.animate(
          [
            { transform: 'translateY(0)' },
            { transform: `translateY(${targetTop - rect.top}px)` },
          ],
          { duration, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' },
        ),
      )
      const label = wrapper.querySelector('[data-admin-menu-label]')
      if (label)
        animations.push(
          label.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration,
            fill: 'forwards',
          }),
        )
    }
    await Promise.all(animations.map(animation => animation.finished.catch(() => {})))
  }
  expanded = false
  // Suppress layout/outro animation: the icons have already reached their resting slots.
  await tick()
  for (const animation of animations) animation.cancel()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  retracting = false
  if (restoreFocus) trigger?.focus()
}

// Navigation and permission changes must never leave stale destinations open.
$effect(() => {
  pathname
  destinations
  isNarrow
  untrack(() => {
    void close()
  })
})
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === 'Escape' && expanded) close(true)
  }}
  onpointerdown={event => {
    if (expanded && event.target instanceof Node && !nav?.contains(event.target))
      close()
  }}
/>

{#snippet destination(item: AdminMenuItem, labeled = false)}
  {@const active = pathname.startsWith(item.href)}
  {@const count = item.notificationCount ?? 0}
  <a
    href={item.href}
    aria-label={item.label}
    aria-current={active ? 'page' : undefined}
    title={labeled ? undefined : item.label}
    class={labeled
      ? 'hover:bg-base-300 focus-visible:outline-primary relative flex w-full min-w-0 flex-col items-center gap-2 rounded-xl px-1 py-3 text-center focus-visible:outline-2'
      : 'hover:bg-base-300 focus-visible:outline-primary relative flex size-12 shrink-0 items-center justify-center rounded-full focus-visible:outline-2'}
    class:text-primary={active}
    onclick={event => {
      close()
      item.onClick?.(event)
    }}
  >
    <span class="relative block size-6 shrink-0" data-admin-menu-icon>
      <item.icon class="size-6" />
      {#if count > 0}
        <span
          class="border-base-100 bg-primary text-primary-content pointer-events-none absolute -top-3 -right-3 flex size-5 items-center justify-center rounded-full border text-[10px] font-bold"
          role="img"
          aria-label={`${count}`}
        >
          {count > 99 ? '∞' : count}
        </span>
      {/if}
    </span>
    {#if labeled}
      <span
        data-admin-menu-label
        in:fade={{
          duration: retracting ? 0 : duration,
          delay: expanded ? 80 : 0,
        }}
        class="w-full text-[10px] leading-snug whitespace-pre-line"
        >{item.compactLabel ?? item.label}</span
      >
    {/if}
  </a>
{/snippet}

<nav
  bind:this={nav}
  aria-label="Admin menu"
  class="bits-theme text-base-content relative w-full shrink-0"
  style:height={isNarrow
    ? `${Math.min(items.length, 5) * 48 + Math.max(0, Math.min(items.length, 5) - 1) * 8 + 24}px`
    : '72px'}
>
  <div
    {id}
    data-admin-menu-expanded={expanded}
    class="border-border bg-panel absolute bottom-0 left-0 z-50 w-full [scrollbar-width:none] items-start border-t py-3"
    class:grid={expanded || isNarrow}
    class:flex={!expanded && !isNarrow}
    class:justify-center={!isNarrow}
    class:gap-x-2={!isNarrow}
    class:px-4={!isNarrow}
    class:px-2={isNarrow}
    class:rounded-t-xl={expanded}
    class:shadow-xl={expanded}
    style:grid-template-columns={!isNarrow && expanded ? 'repeat(5, 48px)' : undefined}
    class:grid-cols-1={isNarrow}
    class:gap-y-2={expanded || isNarrow}
    style:max-height="calc(100dvh - 88px)"
    class:overflow-y-auto={expanded && !retracting}
    class:overflow-hidden={retracting}
  >
    {#each entries as entry (entry.key)}
      <div
        data-menu-item
        animate:moveItem
        in:revealItem
        class="flex min-w-0 justify-center"
        class:w-12={!expanded && !isNarrow}
        class:shrink-0={!expanded}
        class:sticky={isNarrow && expanded && !entry.item}
        class:bottom-0={isNarrow && expanded && !entry.item}
        class:bg-panel={isNarrow && expanded && !entry.item}
      >
        {#if entry.item}
          {@render destination(entry.item, expanded)}
        {:else}
          <button
            bind:this={trigger}
            type="button"
            aria-expanded={expanded}
            aria-controls={id}
            aria-label={expanded ? 'Close views' : 'All views'}
            title={expanded ? 'Close views' : 'All views'}
            onclick={() => {
              if (expanded) void close()
              else expanded = true
            }}
            class="hover:bg-base-300 focus-visible:outline-primary flex min-h-12 w-full min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-1 py-3 focus-visible:outline-2"
            class:text-primary={expanded}
          >
            {#if expanded}
              <CloseIcon class="size-6 shrink-0" />
            {:else}
              <GridIcon class="size-6 shrink-0" />
            {/if}
            {#if expanded}
              <span
                in:fade={{ duration: retracting ? 0 : duration }}
                data-admin-menu-label
                class="text-[10px] leading-snug"
                >Close</span
              >
            {/if}
          </button>
        {/if}
      </div>
    {/each}
  </div>
</nav>
