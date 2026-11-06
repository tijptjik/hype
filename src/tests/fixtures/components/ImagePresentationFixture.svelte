<script lang="ts">
// COMPONENTS
import IndexCardHeader from '#lib/bits/patterns/cards/indexCard/components/IndexCardHeader.svelte'
import ImageSurface from '#lib/bits/patterns/images/components/ImageSurface.svelte'
import ViewerStage from '#lib/bits/patterns/images/components/ViewerStage.svelte'
import ViewerControls from '#lib/bits/patterns/images/components/controls/ViewerControls.svelte'
// TYPES
import type { ImagePresentation } from '#lib/images/presentation.js'

let mode = $state<ImagePresentation>('contain')
let src = $state('https://images.test/__edge-square.png')
let disabled = $state(false)
let saves = $state(0)
const item = $derived({ id: 'logo', src, alt: 'Example logo', presentationMode: mode })

/**
 * Exercises the toolbar's save-pending state without mutating application data.
 * @param next - Selected presentation choice.
 * @returns Completion after a simulated metadata save.
 */
async function save(next: ImagePresentation): Promise<void> {
  mode = next
  saves += 1
  await new Promise(resolve => setTimeout(resolve, 100))
}
</script>

<main class="bits-theme bg-base-100 text-base-content min-h-screen p-6">
  <h1 class="mb-4 text-xl font-semibold">Image presentation</h1>
  <nav class="mb-4 flex flex-wrap gap-4">
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-square.png'
      }}
    >
      Square logo
    </button>
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-wide.png'
      }}
    >
      Wide image
    </button>
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-bands.png'
      }}
    >
      Colour bands
    </button>
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-alpha.png'
      }}
    >
      Transparent logo
    </button>
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-rim.png'
      }}
    >
      Export rim
    </button>
    <button
      type="button"
      onclick={() => {
        src =
          new URLSearchParams(location.search).get('reference') ??
          'https://images.test/__edge-eunic.webp'
      }}
    >
      EUNIC logo
    </button>
    <button
      type="button"
      onclick={() => {
        src = 'https://images.test/__edge-crisp.png'
      }}
    >
      Intentional border
    </button>
    <button
      type="button"
      onclick={() => {
        disabled = !disabled
      }}
    >
      Toggle readonly
    </button>
  </nav>
  <output aria-label="Saved mode">{mode}</output>
  <output aria-label="Save count">{saves}</output>
  <section class="mt-4 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
    <div>
      <h2 class="mb-2">Card</h2>
      <div data-testid="card" class="w-full max-w-[300px] overflow-hidden rounded-2xl">
        <IndexCardHeader imageSrc={src} imageAlt="Example logo" imageLayout={mode} />
      </div>
    </div>
    <div>
      <h2 class="mb-2">Editor / viewer</h2>
      <div data-testid="stage" class="bg-base-200 relative h-[320px]">
        <ViewerStage currentItem={item} fit={mode === 'cover' ? 'cover' : 'fit'} />
        <ViewerControls
          presentationMode={mode}
          canMutate={!disabled}
          showPublishedToggle={false}
          showReplaceButton={false}
          showDownloadButton={false}
          onPresentationModeChange={save}
        />
      </div>
    </div>
    <div class="min-w-0 lg:col-span-2">
      <h2 class="mb-2">Fractional card dimensions</h2>
      <div data-testid="fractional-card" class="mb-6 max-w-full" style:width="363px">
        <IndexCardHeader imageSrc={src} imageAlt="Fractional logo" imageLayout={mode} />
      </div>
      <h2 class="mb-2">Shared image surface</h2>
      <div data-testid="surface" class="bg-base-200 h-[240px]">
        <ImageSurface {item} fit={mode === 'cover' ? 'cover' : 'fit'} />
      </div>
    </div>
  </section>
</main>
