<script lang="ts">
// SVELTE
import { onDestroy, setContext, tick, untrack } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { SvelteMap } from 'svelte/reactivity'
import type { Snippet } from 'svelte'
// CONTEXT
import { ROUTE_READINESS, type RouteReadiness } from './routeReadiness'

let { routeKey, children }: { routeKey: string; children: Snippet } = $props()
let liveLayer = $state<HTMLDivElement>()
let snapshotLayer = $state<HTMLDivElement>()
let previousKey = untrack(() => routeKey)
let hasSnapshot = $state(false)
let revealed = $state(true)
let cleanupTimer: ReturnType<typeof setTimeout> | undefined
let generation = 0
let prepared = false
const pending = new SvelteMap<symbol, string>()
const duration = $derived(prefersReducedMotion.current ? 0 : 160)

setContext<RouteReadiness>(ROUTE_READINESS, {
  registerPending() {
    const token = Symbol()
    pending.set(token, routeKey)
    return () => pending.delete(token)
  },
})

/**
 * Freezes the rendered route without keeping its subscriptions or controls active.
 * @param source Last visible route layer.
 * @param target Inert snapshot container.
 * @returns Nothing.
 * @remarks Scroll offsets are DOM properties, so cloning markup alone loses them.
 */
function capture(source: HTMLElement, target: HTMLElement): void {
  const clone = source.cloneNode(true) as HTMLElement
  clone.style.opacity = '1'
  clone.style.display = 'flex'
  clone.style.height = '100%'
  clone.removeAttribute('inert')
  clone.removeAttribute('data-route-live')
  const originals = [source, ...source.querySelectorAll<HTMLElement>('*')]
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
  target.replaceChildren(clone)
  for (let index = 0; index < copies.length; index++) {
    copies[index].removeAttribute('id')
    copies[index].scrollTop = originals[index].scrollTop
    copies[index].scrollLeft = originals[index].scrollLeft
  }
}

/**
 * Captures the ready list before SvelteKit updates either the page subtree or URL.
 * @returns Nothing.
 * @remarks Called by onNavigate; URL effects alone may run after the old page changes.
 */
export function prepareNavigation(): void {
  generation++
  clearTimeout(cleanupTimer)
  if (
    liveLayer &&
    snapshotLayer &&
    liveLayer.querySelector('[data-resource-index]') &&
    (!hasSnapshot || revealed) &&
    ![...pending.values()].includes(previousKey)
  ) {
    capture(liveLayer, snapshotLayer)
    hasSnapshot = true
  }
  prepared = true
  revealed = !hasSnapshot
  // Apply immediately, before a page subtree can paint its destination loader.
  if (hasSnapshot && liveLayer && snapshotLayer) {
    liveLayer.style.transitionDuration = '0ms'
    liveLayer.style.opacity = '0'
    snapshotLayer.style.transitionDuration = '0ms'
    snapshotLayer.style.opacity = '1'
  }
}

// Capture before Svelte replaces the route; retain the last ready view on rapid navigation.
$effect.pre(() => {
  const nextKey = routeKey
  untrack(() => {
    if (nextKey === previousKey) return
    generation++
    clearTimeout(cleanupTimer)
    if (
      !prepared &&
      liveLayer &&
      snapshotLayer &&
      liveLayer.querySelector('[data-resource-index]') &&
      (!hasSnapshot || revealed) &&
      ![...pending.values()].includes(previousKey)
    ) {
      capture(liveLayer, snapshotLayer)
      hasSnapshot = true
    }
    // Descendant global outros may retain this node, but it must not occupy layout.
    if (liveLayer) liveLayer.style.display = 'none'
    revealed = !hasSnapshot
    previousKey = nextKey
    prepared = false
  })
})

// Wait for both record readiness and the new layout's first measurement before fading.
$effect(() => {
  const key = routeKey
  const loading = [...pending.values()].includes(key)
  if (loading || prepared) return
  let cancelled = false
  const currentGeneration = generation
  void tick().then(() => {
    if (cancelled || currentGeneration !== generation) return
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || currentGeneration !== generation) return
        revealed = true
        cleanupTimer = setTimeout(() => {
          snapshotLayer?.replaceChildren()
          hasSnapshot = false
        }, duration)
      }),
    )
  })
  return () => {
    cancelled = true
  }
})

onDestroy(() => {
  generation++
  clearTimeout(cleanupTimer)
})
</script>

<div
  class="relative grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-hidden"
  aria-busy={hasSnapshot && !revealed}
>
  {#key routeKey}
    <div
      bind:this={liveLayer}
      data-route-live
      class="col-start-1 row-start-1 flex min-h-0 min-w-0 flex-col overflow-hidden transition-opacity motion-reduce:transition-none"
      style:opacity={hasSnapshot && !revealed ? 0 : 1}
      style:transition-duration={`${duration}ms`}
      inert={hasSnapshot && !revealed}
    >
      {@render children()}
    </div>
  {/key}
  <div
    bind:this={snapshotLayer}
    data-route-snapshot
    class="pointer-events-none absolute inset-0 overflow-hidden transition-opacity motion-reduce:transition-none"
    style:opacity={hasSnapshot && !revealed ? 1 : 0}
    style:transition-duration={revealed ? `${duration}ms` : '0ms'}
    aria-hidden="true"
    inert
  ></div>
</div>
