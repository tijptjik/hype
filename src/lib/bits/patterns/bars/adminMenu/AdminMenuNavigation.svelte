<script lang="ts">
// SVELTE
import { tick, untrack } from 'svelte'
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
let panel = $state<HTMLDivElement>()
let panelAnimation: Animation | undefined
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

/** Slide the panel as one rigid surface, clipping the portion below the footer.
 * @param opening Whether to reveal the expanded panel.
 * @returns Completion of the panel movement, including interrupted animations.
 */
async function slidePanel(opening: boolean): Promise<void> {
  if (!panel || !nav) return
  const distance = Math.max(0, panel.offsetHeight - nav.offsetHeight)
  const hidden = {
    transform: `translateY(${distance}px)`,
    clipPath: `inset(0 0 ${distance}px 0)`,
  }
  const visible = { transform: 'translateY(0)', clipPath: 'inset(0)' }
  const current = panelAnimation
    ? {
        transform: getComputedStyle(panel).transform,
        clipPath: getComputedStyle(panel).clipPath,
      }
    : opening
      ? hidden
      : visible
  panelAnimation?.cancel()
  // Every row keeps its expanded position; only the panel moves over the footer edge.
  const animation = panel.animate([current, opening ? visible : hidden], {
    duration,
    easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    fill: 'forwards',
  })
  panelAnimation = animation
  await animation.finished.catch(() => {})
  if (panelAnimation === animation && opening) {
    animation.cancel()
    panelAnimation = undefined
  }
}

/** Lay out every destination before revealing the panel.
 * @returns Completion of the opening movement.
 */
async function open(): Promise<void> {
  if (expanded || retracting) return
  expanded = true
  await tick()
  if (!retracting) await slidePanel(true)
}

/** Slide the expanded panel away before restoring the compact shortcuts.
 * @param restoreFocus Whether Escape should return focus to the toggle.
 * @returns Completion after the panel movement and compact layout commit.
 */
async function close(restoreFocus = false): Promise<void> {
  if (!expanded || retracting) return
  retracting = true
  await slidePanel(false)
  expanded = false
  // Restore the compact layout only once the expanded panel has reached the footer.
  await tick()
  panelAnimation?.cancel()
  panelAnimation = undefined
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
          aria-busy={item.notificationPending || undefined}
          style:opacity={item.notificationPending ? 0.6 : 1}
        >
          {#if count > 99}
            <svg
              class="h-2.5 w-3.5 shrink-0"
              viewBox="-1 0 26 16"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path
                d="M12 8C9 4 8 3 6 3a5 5 0 0 0 0 10c2 0 3-1 6-5s4-5 6-5a5 5 0 0 1 0 10c-2 0-3-1-6-5Z"
              />
            </svg>
          {:else}
            {count}
          {/if}
        </span>
      {/if}
    </span>
    {#if labeled}
      <span
        data-admin-menu-label
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
    bind:this={panel}
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
              else void open()
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
              <span data-admin-menu-label class="text-[10px] leading-snug">Close</span>
            {/if}
          </button>
        {/if}
      </div>
    {/each}
  </div>
</nav>
