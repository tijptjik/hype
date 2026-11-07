<script lang="ts">
// DOMAIN
import { identityTitle, identityPhoto } from './featureIdentity.types'
// TYPES
import type { IdentitySource, IdentityOutput } from './featureIdentity.types'

let { output = $bindable(), sources, index, kind, blocked, onSource, onImage, onMove, onProperty, onRemove }: {
  output: IdentityOutput; sources: IdentitySource[]; index: number; kind: 'merge' | 'split'; blocked: boolean
  onSource: (id: string) => void
  onImage: (sourceId: string, imageId: string, selected: boolean) => void
  onMove: (imageIndex: number, offset: number) => void
  onProperty: (propertyId: string, sourceId: string) => void
  onRemove?: () => void
} = $props()
const selectedSource = $derived(sources.find(source => source.featureId === output.sourceFeatureId)!)
const locale = $derived(Object.hasOwn(output.titles, 'en') ? 'en' : Object.keys(output.titles)[0])
const inheritedName = $derived(Boolean(selectedSource.content.placement.location && selectedSource.content.placement.location.acceptancePolicy?.nameMode !== 'independent'))
const cover = $derived(output.images.find(image => image.imageId === output.coverImageId) ?? output.images[0])
const coverSource = $derived(cover ? sources.find(source => source.featureId === cover.sourceFeatureId) : undefined)
const fieldClass = 'w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50'
const actionClass = 'rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40'
</script>

<fieldset class="min-w-0 overflow-hidden rounded-2xl border border-border bg-background" aria-label={kind === 'merge' ? 'Merged Feature' : `Result ${index + 1}`}>
  <div class="relative aspect-[16/9] overflow-hidden bg-primary/5">
    {#if cover && coverSource}
      <img class="h-full w-full object-cover" src={identityPhoto(coverSource, cover.imageId)} alt={output.titles[locale] || `Result ${index + 1}`} />
    {:else}
      <div class="flex h-full items-center justify-center text-sm text-muted-foreground">Choose photos below</div>
    {/if}
    <span class="absolute left-3 top-3 rounded-full bg-black/75 px-3 py-1 text-xs font-medium text-white">{kind === 'merge' ? 'Merged Feature' : `Result ${index + 1}`}</span>
    {#if onRemove}<button type="button" class="absolute right-3 top-3 rounded-full bg-black/75 px-3 py-1 text-xs text-white" disabled={blocked} onclick={onRemove}>Remove result</button>{/if}
  </div>
  <div class="grid gap-5 p-4">
    <label class="grid gap-2 text-sm font-medium">Feature title
      <input class={fieldClass} bind:value={output.titles[locale]} disabled={blocked || inheritedName} placeholder="Name this result" />
      {#if inheritedName}<span class="text-xs font-normal text-muted-foreground">This name follows its linked Location.</span>{/if}
    </label>
    <div class="grid gap-2">
      <div class="flex items-center justify-between gap-2"><h4 class="text-sm font-medium">Photos</h4><span class="text-xs text-muted-foreground">{output.images.length} selected</span></div>
      <p class="text-xs text-muted-foreground">{kind === 'split' ? 'Select the photos that belong here. A photo can belong to more than one result.' : 'Choose photos from either source for the combined gallery.'}</p>
      <div class="grid grid-cols-3 gap-2">
        {#each sources as source}{#each source.content.gallery.order as imageId}
          {@const selected = output.images.some(image => image.imageId === imageId)}
          <button type="button" class={`relative aspect-square overflow-hidden rounded-lg border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'}`} disabled={blocked} aria-pressed={selected} aria-label={`${selected ? 'Remove' : 'Add'} photo ${source.content.gallery.order.indexOf(imageId) + 1} from ${identityTitle(source)}`} onclick={() => onImage(source.featureId, imageId, !selected)}>
            <img src={identityPhoto(source, imageId)} alt="" class="h-full w-full object-cover" />
            <span aria-hidden="true" class={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-xs ${selected ? 'bg-primary text-primary-content' : 'bg-black/60 text-white'}`}>{selected ? '✓' : '+'}</span>
          </button>
        {/each}{/each}
      </div>
      {#if output.images.length}
        <details class="rounded-lg border border-border p-3">
          <summary class="cursor-pointer text-xs font-medium">Cover photo & gallery order</summary>
          <div class="mt-3 grid gap-2">
            {#each output.images as image, imageIndex}
              {@const source = sources.find(source => source.featureId === image.sourceFeatureId)!}
              <div class="flex items-center gap-2">
                <img class="h-10 w-12 shrink-0 rounded object-cover" src={identityPhoto(source, image.imageId)} alt={`Selected photo ${imageIndex + 1}`} />
                <button type="button" class={`${actionClass} mr-auto`} aria-pressed={output.coverImageId === image.imageId} disabled={blocked} onclick={() => output.coverImageId = image.imageId}>{output.coverImageId === image.imageId ? '✓ Cover' : 'Make cover'}</button>
                <button type="button" class={actionClass} disabled={blocked || imageIndex === 0} aria-label={`Move image ${imageIndex + 1} earlier`} onclick={() => onMove(imageIndex, -1)}>↑</button>
                <button type="button" class={actionClass} disabled={blocked || imageIndex === output.images.length - 1} aria-label={`Move image ${imageIndex + 1} later`} onclick={() => onMove(imageIndex, 1)}>↓</button>
              </div>
            {/each}
          </div>
        </details>
      {/if}
    </div>
    <details class="border-t border-border pt-3">
      <summary class="cursor-pointer text-sm text-muted-foreground">Content, translations & identity</summary>
      <div class="mt-4 grid gap-4">
        <label class="grid gap-2 text-sm">{kind === 'merge' ? 'Keep this Feature’s identity' : 'Result identity'}
          <select class={fieldClass} bind:value={output.featureId} disabled={blocked || kind === 'split'}>
            {#if !output.featureId}<option value={null}>New Feature</option>{/if}
            {#each sources as source}<option value={source.featureId}>{identityTitle(source)}</option>{/each}
          </select>
        </label>
        <label class="grid gap-2 text-sm">Use content and Location from
          <select class={fieldClass} value={output.sourceFeatureId} disabled={blocked} onchange={event => onSource(event.currentTarget.value)}>
            {#each sources as source}<option value={source.featureId}>{identityTitle(source)}</option>{/each}
          </select>
        </label>
        {#each Object.keys(output.titles).filter(value => value !== locale) as language}
          <label class="grid gap-2 text-sm">Title ({language})<input class={fieldClass} bind:value={output.titles[language]} disabled={blocked || inheritedName} /></label>
        {/each}
        {#each [...new Set(sources.flatMap(source => Object.keys(source.content.properties)))] as propertyId}
          {@const definition = sources.find(source => source.content.properties[propertyId])!.content.properties[propertyId].selection.definition}
          {@const inheritedPhone = definition.component === 'PhoneField' && Boolean(selectedSource.content.placement.location && selectedSource.content.properties[propertyId])}
          <label class="grid gap-2 text-sm">{Object.values(definition.labels)[0]?.value ?? propertyId}
            <select class={fieldClass} disabled={blocked || inheritedPhone} value={output.properties.find(property => property.propertyId === propertyId)?.sourceFeatureId ?? ''} onchange={event => onProperty(propertyId, event.currentTarget.value)}>
              <option value="">Omit field</option>
              {#each sources.filter(source => source.content.properties[propertyId]) as source}
                <option value={source.featureId} disabled={Boolean(definition.component === 'PhoneField' && selectedSource.content.placement.location && source.featureId !== output.sourceFeatureId)}>{identityTitle(source)} · {source.content.properties[propertyId].selection.value ?? source.content.properties[propertyId].selection.definition.selectedOption?.value ?? 'Stored value'}</option>
              {/each}
            </select>
            {#if inheritedPhone}<span class="text-xs text-muted-foreground">Uses the accepted phone value from the selected Location.</span>{/if}
          </label>
        {/each}
      </div>
    </details>
  </div>
</fieldset>
