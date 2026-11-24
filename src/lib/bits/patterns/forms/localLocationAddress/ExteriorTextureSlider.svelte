<script lang="ts">
// DOMAIN
import { textureLabel } from '#lib/locations/exterior/floorTexture.js'
// TYPES
import type { ModelViewerElement } from '@google/model-viewer'
import type { bindTextureBlend } from '#lib/locations/exterior/textureBlend.js'

let {
  viewer,
  value = $bindable(1),
  onfailure,
}: { viewer: ModelViewerElement; value?: number; onfailure: () => void } = $props()
const stopsId = $props.id()
let binding = $state.raw<Awaited<ReturnType<typeof bindTextureBlend>>>()
const labels = ['Government', 'Revised', 'AI-generated']
const description = $derived(textureLabel(value))

$effect(() => {
  const current = viewer
  const controller = new AbortController()
  let cleanup: (() => void) | undefined
  void import('#lib/locations/exterior/textureBlend.js')
    .then(module => module.bindTextureBlend(current, controller.signal))
    .then(result => {
      if (controller.signal.aborted) return result.dispose()
      cleanup = result.dispose
      binding = result
    })
    .catch(error => {
      if (!controller.signal.aborted) {
        console.error('Exterior texture layers could not be prepared', error)
        onfailure()
      }
    })
  return () => {
    controller.abort()
    cleanup?.()
    binding = undefined
  }
})
$effect(() => binding?.set(value))
</script>

{#if binding}
  <fieldset class="w-full max-w-72" aria-label="Facade textures">
    <input
      aria-label="Facade texture blend"
      aria-valuetext={description}
      type="range"
      min="0"
      max="2"
      step="0.01"
      list={stopsId}
      bind:value
      class="accent-primary block w-full cursor-pointer"
    >
    <datalist id={stopsId}>
      <option value="0"></option>
      <option value="1"></option>
      <option value="2"></option>
    </datalist>
    <div class="grid grid-cols-3">
      {#each labels as label, index (label)}
        <button
          type="button"
          aria-pressed={value === index}
          onclick={() => (value = index)}
          class="text-muted-foreground aria-pressed:text-foreground flex flex-col items-center gap-0.5 text-xs first:items-start last:items-end aria-pressed:font-semibold"
        >
          <span aria-hidden="true" class="bg-border h-1 w-px"></span>{label}
        </button>
      {/each}
    </div>
  </fieldset>
{:else}
  <div
    role="status"
    aria-label="Preparing facade textures"
    class="bg-muted h-9 w-full max-w-72 animate-pulse rounded"
  ></div>
{/if}
