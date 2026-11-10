<script lang="ts">
import { untrack } from 'svelte'
// API
import { getFeatureIntentOptions } from '#lib/api/featureIntents.remote.js'
// TYPES
import type { FeatureType } from '#lib/features/intents.js'
let {
  layerId,
  value,
  onChange,
}: {
  layerId: string
  value?: string | null
  onChange: (type: FeatureType | null) => void
} = $props()
let types = $state<FeatureType[] | null>(null)
let failed = $state(false)
let retry = $state(0)
$effect(() => {
  const id = layerId
  retry
  const previous = untrack(() => value)
  let cancelled = false
  types = null
  failed = false
  untrack(() => onChange(null))
  getFeatureIntentOptions({ layerId: id })
    .then(result => {
      if (cancelled) return
      types = result
      if (result.length === 1) onChange(result[0])
      else {
        const retained = result.find(type => type.id === previous)
        if (retained) onChange(retained)
      }
    })
    .catch(() => {
      if (!cancelled) failed = true
    })
  return () => {
    cancelled = true
  }
})
</script>
<section class="mb-8 grid min-w-0 gap-3 rounded-lg border p-5">
  <h3 class="font-semibold">What are you adding?</h3>
  {#if failed}
    <p role="alert">Unable to load feature types.</p>
    <button
      type="button"
      class="justify-self-start rounded border px-3 py-2"
      onclick={() => (retry += 1)}
    >
      Retry
    </button>
  {:else if types === null}
    <p role="status">Loading feature types…</p>
  {:else if types.length === 0}
    <p role="alert">
      This layer has no available feature types. Update its feature type settings before
      adding a feature.
    </p>
  {:else if types.length === 1}
    <p>Adding: <strong>{types[0].label}</strong></p>
  {:else}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
      {#each types as type (type.id)}
        <button
          type="button"
          aria-pressed={value === type.id}
          class="aria-pressed:border-primary aria-pressed:bg-primary/10 min-w-0 rounded border p-3 text-left break-words whitespace-normal focus-visible:outline-2"
          onclick={() => onChange(type)}
        >
          {type.label}
        </button>
      {/each}
    </div>
  {/if}
  {#if value && types?.some(type => type.id === value)}
    <p class="text-muted-foreground text-sm">
      {types.find(type => type.id === value)?.start === 'pin'
        ? 'Start with a map position; add a relevant location if needed.'
        : 'Find a relevant location, then confirm the feature’s precise position.'}
    </p>
  {/if}
</section>
