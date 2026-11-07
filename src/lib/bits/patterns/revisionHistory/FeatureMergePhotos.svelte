<script lang="ts">
// IMAGE INTENTS
import { getImageIntentOptions } from '#lib/api/image.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
import { DEFAULT_IMAGE_INTENTS, type ImageIntentDefinition } from '#lib/images/intents.js'

// COMPONENTS
import ThumbnailIntent from '#lib/bits/patterns/images/components/ThumbnailIntent.svelte'
// I18N
import { m } from '#lib/i18n.js'
// DOMAIN
import { identityPhoto } from './featureIdentity.types'
// TYPES
import type { IdentitySource } from './featureIdentity.types'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'
type Output = FeatureIdentitySelection['outputs'][number]
type Intent = NonNullable<Output['images']>[number]['intent']
let {
  sources,
  output = $bindable(),
  busy = false,
}: { sources: IdentitySource[]; output: Output; busy?: boolean } = $props()
const photos = $derived.by(() => {
  const seen = new Set<string>()
  return sources.flatMap(source =>
    source.content.gallery.order
      .filter(id => !seen.has(id) && Boolean(seen.add(id)))
      .map(id => ({ id, source })),
  )
})
let intentOptions = $state<ImageIntentDefinition[]>([...DEFAULT_IMAGE_INTENTS])
$effect(() => {
  const featureId = sources[0]?.featureId
  let active = true
  if (featureId) void refreshRemoteQuery(getImageIntentOptions({ ctxType: 'feature', ctxId: featureId, meta: { isAdminRequest: true } })).then(policy => { if (active) intentOptions = policy.intents }).catch(cause => console.error('Could not load image intents', cause))
  return () => { active = false }
})
let excludedIntents = $state<Record<string, Intent>>({})

/** Move a photo between Discard and Keep without changing its attributable source.
 * @param id Image being moved. @returns Nothing.
 */
function move(id: string): void {
  const photo = photos.find(photo => photo.id === id)
  if (!photo || busy) return
  const selected = output.images?.find(image => image.imageId === id)
  if (selected) {
    excludedIntents[id] =
      selected.intent ?? photo.source.content.gallery.entries[id].intent
    output.images = output.images?.filter(image => image.imageId !== id)
    if (output.coverImageId === id) delete output.coverImageId
  } else {
    output.images = [
      ...(output.images ?? []),
      {
        sourceFeatureId: photo.source.featureId,
        imageId: id,
        intent: excludedIntents[id] ?? photo.source.content.gallery.entries[id].intent,
      },
    ]
    if (output.images.at(-1)?.intent === 'canonical') setIntent(id, 'canonical')
  }
}

/** Set a selected photo's intent and keep at most one cover.
 * @param id Image being classified. @param intent Reviewed image purpose. @returns Nothing.
 */
function setIntent(id: string, intent: Intent): void {
  const selected = output.images?.find(image => image.imageId === id)
  if (!selected) {
    excludedIntents[id] = intent
    return
  }
  selected.intent = intent
  if (intent === 'canonical') {
    output.coverImageId = id
    for (const image of output.images ?? [])
      if (
        image.imageId !== id &&
        (image.intent ??
          photos.find(photo => photo.id === image.imageId)?.source.content.gallery
            .entries[image.imageId].intent) === 'canonical'
      )
        image.intent = 'general'
  } else if (output.coverImageId === id) delete output.coverImageId
}
</script>
<section class="space-y-4">
  <h4 class="border-border border-b pb-2 text-center font-medium">Photos</h4>
  <p class="text-muted-foreground text-center text-sm">
    Click a photo to move it between Discard and Keep. Use the control on each photo to
    choose its purpose.
  </p>
  <div class="grid grid-cols-2 gap-4">
    {#each ['Discard', 'Keep'] as side}
      <section class="min-w-0 space-y-3" aria-label={`${side} photos`}>
        <h5 class={`text-sm font-semibold ${side === 'Discard' ? 'text-right' : ''}`}>{side}</h5>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
          {#each photos.filter(
            photo =>
              Boolean(output.images?.some(image => image.imageId === photo.id)) ===
              (side === 'Keep'),
          ) as photo (photo.id)}
            {@const selected = output.images?.find(image => image.imageId === photo.id)}
            {@const intent =
              selected?.intent ??
              excludedIntents[photo.id] ??
              photo.source.content.gallery.entries[photo.id].intent}
            <div class="min-w-0 space-y-1.5" data-merge-photo={photo.id}>
              <div class="relative aspect-square w-full">
                <button
                  type="button"
                  class="border-border focus-visible:outline-primary block h-full w-full overflow-hidden rounded-lg border focus-visible:outline-2"
                  disabled={busy}
                  aria-label={`Move photo ${photo.id} to ${side === 'Keep' ? 'Discard' : 'Keep'}`}
                  onclick={() => move(photo.id)}
                >
                  <img
                    src={identityPhoto(photo.source, photo.id)}
                    alt=""
                    class="h-full w-full object-cover"
                  >
                </button>
                {#if !sources[0].content.gallery.entries[photo.id]}
                  <span
                    class="pointer-events-none absolute top-2 right-2 z-20 inline-flex items-center rounded-full bg-[#2A6FEC] px-2.5 py-1 text-[10px] font-semibold tracking-[0.22em] text-white uppercase shadow-[0_8px_20px_rgba(0,0,0,0.32)]"
                    >{m.gallery__new_badge()}</span
                  >
                {/if}
                <ThumbnailIntent
                  item={{
                    id: photo.id,
                    src: identityPhoto(photo.source, photo.id),
                    intent,
                    meta: { intentOptions },
                  }}
                  disabled={busy}
                  label={`Photo intent ${photo.id}`}
                  contentSide="top"
                  contentClass="z-[1100]"
                  onIntentChange={(_item, next) => setIntent(photo.id, next)}
                />
              </div>
              {#if sources[0].content.gallery.entries[photo.id]}
                <span class={`text-muted-foreground block text-xs ${side === 'Discard' ? 'text-right' : ''}`}
                  >Already in gallery</span
                >
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</section>
