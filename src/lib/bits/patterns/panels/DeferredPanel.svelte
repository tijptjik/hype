<script lang="ts" generics="T">
// SVELTE
import { untrack, type Snippet } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'

let {
  active,
  load,
  children,
}: {
  active: boolean
  load: () => Promise<{ default: T }>
  children: Snippet<[T]>
} = $props()

let component = $state.raw<T | null>(null)
let failed = $state(false)
let pending: Promise<void> | null = null

/**
 * Loads a panel on intent and retains its mounted state across subsequent opens.
 * @returns Completion of this attempt, with failures exposed as a retry control.
 * @remarks A failed import is never cached; concurrent opens share one attempt.
 */
function request(): Promise<void> {
  if (component !== null) return Promise.resolve()
  if (pending) return pending
  failed = false
  pending = Promise.resolve()
    .then(load)
    .then(module => {
      component = module.default
    })
    .catch(() => {
      failed = true
    })
    .finally(() => {
      pending = null
    })
  return pending
}

$effect(() => {
  if (active)
    untrack(() => {
      void request()
    })
})
</script>

{#if component !== null}
  {@render children(component)}
{:else if active}
  <div
    role="status"
    class="bg-panel pointer-events-auto absolute top-24 left-1/2 z-50 -translate-x-1/2 rounded-xl p-4 shadow-lg"
  >
    {#if failed}
      <button type="button" class="rounded px-3 py-2 underline" onclick={request}>
        {m.bootstrap__retry()}
      </button>
    {:else}
      <span>{m.resource_loading()}</span>
    {/if}
  </div>
{/if}
