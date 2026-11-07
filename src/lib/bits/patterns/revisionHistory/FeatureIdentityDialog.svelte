<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// PRIMITIVES
import { Dialog } from 'bits-ui'
// API
import { inspectCreationDuplicate, applyCreationDuplicate } from '#lib/api/featureCreationDuplicate.remote.js'
import { inspectFeatureIdentity, applyFeatureIdentity } from '#lib/api/featureIdentity.remote.js'
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// CONTEXT
import { getSurfaceCtx } from '#lib/context/resourceView.svelte.js'
// DOMAIN
import { identityTitle, identityPhoto } from './featureIdentity.types'
// TYPES
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { IdentitySource } from './featureIdentity.types'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'

let { open = $bindable(false), kind, featureId, layerId, duplicateTaskId, creationProposal, onApplied }: {
  open?: boolean; kind: 'split' | 'merge'; featureId: string; layerId: string; duplicateTaskId?: string; creationProposal?: boolean
  onApplied: (ids: string[]) => Promise<void>
} = $props()
const view = getSurfaceCtx()
let sources = $state<IdentitySource[]>([])
let names = $state(['', ''])
let redirect = $state('none')
let search = $state('')
let matches = $state<{id:string;title:string}[]>([])
let busy = $state(false), message = $state('')
let output = $state<FeatureIdentitySelection['outputs'][number] | null>(null)
let creationTokens = $state<{ proposalId: string; version: string; modifiedAt: string } | null>(null)
let request = 0
const field = 'w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary'
const action = 'rounded-lg border border-border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40'
const primary = $derived(sources[0])
const candidate = $derived(sources[1])
const locale = $derived(primary ? (primary.content.translations.en ? 'en' : Object.keys(primary.content.translations)[0]) : 'en')
const propertyIds = $derived([...new Set(sources.flatMap(source => Object.keys(source.content.properties)))])

/** Inspect current accepted content; stale requests never replace another modal's state. */
async function load(ids: string[]): Promise<void> {
  const token = ++request
  busy = true; message = ''
  try {
    const creation = creationProposal && duplicateTaskId ? await refreshRemoteQuery(inspectCreationDuplicate({ taskId: duplicateTaskId, primaryId: ids[0], meta: { isAdminRequest: true } })) : null
    const values = creation?.sources ?? await refreshRemoteQuery(inspectFeatureIdentity({ featureIds: ids, duplicateTaskId, meta: { isAdminRequest: true } }))
    if (token !== request || !open) return
    creationTokens = creation
    sources = values
    const first = values[0]
    names = [identityTitle(first), identityTitle(first)]
    output = {
      featureId: first.featureId, sourceFeatureId: first.featureId,
      titles: Object.fromEntries([...new Set(values.flatMap(source=>Object.keys(source.content.translations)))].map(key => [key,first.content.translations[key]?.title.value || values[1]?.content.translations[key]?.title.value || ''])),
      descriptions: Object.fromEntries([...new Set(values.flatMap(source=>Object.keys(source.content.translations)))].map(key => [key,first.content.translations[key]?.description.value ?? values[1]?.content.translations[key]?.description.value ?? null])),
      images: [], properties: [], propertyEdits: {},
      coverImageId: first.content.gallery.order.find(id=>first.content.gallery.entries[id].intent==='canonical') ?? first.content.gallery.order[0] ?? values[1]?.content.gallery.order[0],
      profileEdits: {isIntangible:first.content.profile.isIntangible,isVisitable:first.content.profile.visitability.isVisitable,
        asOf:values.map(source=>source.content.profile.visitability.asOf).filter((date): date is string=>Boolean(date)).sort().at(-1) ?? null},
    }
    // Prefer the primary's populated fields, filling gaps from the candidate.
    for (const id of new Set(values.flatMap(source => Object.keys(source.content.properties)))) {
      const chosen = values.find(source => { const row = source.content.properties[id]?.selection; return row && (row.value != null || row.valueJson != null || row.propertyValueId != null) }) ?? values.find(source => source.content.properties[id])!
      output.properties!.push({propertyId:id,sourceFeatureId:chosen.featureId})
    }
    for (const source of values) for (const imageId of source.content.gallery.order)
      if (!output.images!.some(image => image.imageId === imageId)) output.images!.push({sourceFeatureId:source.featureId,imageId})
    search = ''; matches = []
  } catch (cause) { if (token === request) message = cause instanceof Error ? cause.message : 'Unable to load Features' }
  finally { if (token === request) busy = false }
}
$effect(() => {
  const shown = open, id = featureId
  untrack(() => {
    if (shown) { sources = []; output = null; redirect = 'none'; if (!creationProposal) void load([id]) }
    else { request++; busy = false }
  })
})
$effect(() => {
  const text = search.trim(), shown = open, layer = layerId
  if (!shown || !text || kind !== 'merge') return
  let cancelled = false
  const timer = setTimeout(async () => {
    try {
      const result = await refreshRemoteQuery(getFeatureIndexPage({q:text,prisms:{layer:[layer]},conditions:{isArchived:false},
        pagination:{limit:12,offset:0},includeCount:false,meta:{...view.resources.queryMeta,isAdminRequest:true,profile:'admin'}}))
      if (!cancelled) matches = (result.data as Feature[]).filter(row => row.id !== featureId).map(row => ({id:row.id,title:Object.values(row.i18n ?? {}).map(value => value?.title).find(Boolean) || row.id}))
    } catch (cause) { if (!cancelled) message = cause instanceof Error ? cause.message : 'Search unavailable' }
  },250)
  return () => { cancelled = true; clearTimeout(timer) }
})
/** Apply the inspected choices and return the resulting regular editor destinations. */
async function apply(): Promise<void> {
  if (busy || !primary || !output) return
  busy = true; message = ''
  try {
    const selection = {kind, inputs:sources.map(({featureId,revisionId,generation}) => ({featureId,revisionId,generation})),
      outputs:kind === 'split' ? names.map(name => ({featureId:null,sourceFeatureId:primary.featureId,titles:{[locale]:name.trim()}})) : [output],
      redirectOutputIndex:kind === 'split' && redirect !== 'none' ? Number(redirect) : null,
      reason:kind === 'split' ? 'Staff split Feature' : 'Staff merged duplicate Features'}
    const result = creationProposal && duplicateTaskId && creationTokens
      ? await applyCreationDuplicate({ taskId: duplicateTaskId, primaryId: primary.featureId, ...creationTokens, selection, meta: { isAdminRequest: true } })
      : await applyFeatureIdentity({ ...selection, duplicateTaskId, meta: { isAdminRequest: true } })
    open = false
    await onApplied(result.outputs)
  } catch (cause) { message = cause instanceof Error ? cause.message : 'Unable to apply changes' }
  finally { busy = false }
}
/** Read a field's current human-readable value. */
function propertyText(source: IdentitySource, id: string): string {
  const row = source.content.properties[id]?.selection
  return row ? String(row.value ?? row.definition.selectedOption?.value ?? row.propertyValueId ?? (row.valueJson ? JSON.stringify(row.valueJson) : '—')) : '—'
}
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content class={`fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto rounded-2xl border border-border bg-background p-6 text-foreground shadow-xl ${kind === 'merge' ? 'max-w-6xl' : 'max-w-xl'}`}>
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-2">
          <Dialog.Title class="text-xl font-semibold">{kind === 'split' ? 'Split Feature' : 'Merge Features'}</Dialog.Title>
          <Dialog.Description class="text-sm text-muted-foreground">{kind === 'split' ? 'Create two unpublished Features with a copy of this record and its photos. Edit each one afterwards.' : creationProposal ? 'Choose the values and photos to carry over. The existing Feature keeps its identity and publication state.' : 'Choose the values to keep. The primary Feature keeps its identity and publication state; the other record is archived.'}</Dialog.Description>
        </div>
        <Dialog.Close class={action} disabled={busy} aria-label="Close">×</Dialog.Close>
      </div>
      {#if message}<p role="alert" class="text-sm text-red-600">{message}</p>{/if}
      {#if primary && kind === 'split'}
        {#each names as name,index}
          <label class="grid gap-2 text-sm font-medium">Feature {index + 1} name
            <input class={field} bind:value={names[index]} disabled={busy} />
          </label>
        {/each}
        <label class="grid gap-2 text-sm font-medium">Automatic redirect
          <select class={field} bind:value={redirect} disabled={busy}>
            <option value="none">Show links to both Features</option>
            {#each names as name,index}<option value={String(index)}>{name || `Feature ${index+1}`}</option>{/each}
          </select>
          <span class="font-normal text-muted-foreground">The redirect becomes active when the chosen Feature is published. The original is unpublished and archived.</span>
        </label>
      {:else if kind === 'merge'}
        <label class="grid gap-2 text-sm font-medium">{duplicateTaskId ? 'Find the existing Feature' : 'Find another Feature'}
          <input class={field} bind:value={search} disabled={busy} placeholder="Search by name" />
        </label>
        {#if search.trim()}
          <div class="grid gap-1">{#each matches as match}<button class={`${action} text-left whitespace-normal break-words`} disabled={busy} onclick={() => load(duplicateTaskId ? [match.id,featureId] : [featureId,match.id])}>{match.title}</button>{/each}</div>
        {/if}
        {#if primary && output && candidate}
          <div class="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] gap-x-2 sm:gap-x-4">
            <h3 class="min-w-0 whitespace-normal break-words font-medium">{identityTitle(primary)}<span class="block text-xs text-muted-foreground">Primary · keeps its identity</span></h3><span></span>
            <h3 class="min-w-0 whitespace-normal break-words font-medium">{identityTitle(candidate)}<span class="block text-xs text-muted-foreground">{candidate.proposalOnly ? 'Contribution · reviewed into the primary' : 'Archived after merge'}</span></h3>
            <h4 class="col-span-3 mt-6 border-b border-border pb-2 font-medium">Profile</h4>
            {#each Object.keys(output.titles ?? {}) as language}
              <label class="my-3 grid min-w-0 gap-1 text-xs">Name · {language}<input class={field} bind:value={output.titles![language]} disabled={busy} /></label>
              <button class="self-center rounded-full border border-border p-2" disabled={busy} aria-label={`Use other name in ${language}`} onclick={() => output!.titles![language] = output!.titles![language] === candidate.content.translations[language]?.title.value ? primary.content.translations[language]?.title.value ?? '' : candidate.content.translations[language]?.title.value ?? ''}>⇄</button>
              <p class="my-3 self-center whitespace-normal break-words text-sm">{candidate.content.translations[language]?.title.value || '—'}</p>
              <label class="my-3 grid min-w-0 gap-1 text-xs">Description · {language}<textarea class={field} value={output.descriptions?.[language] ?? ''} oninput={event => output!.descriptions![language] = event.currentTarget.value || null} disabled={busy}></textarea></label>
              <button class="self-center rounded-full border border-border p-2" disabled={busy} aria-label={`Use other description in ${language}`} onclick={() => output!.descriptions![language] = output!.descriptions![language] === candidate.content.translations[language]?.description.value ? primary.content.translations[language]?.description.value ?? null : candidate.content.translations[language]?.description.value ?? null}>⇄</button>
              <p class="my-3 self-center whitespace-pre-wrap break-words text-sm">{candidate.content.translations[language]?.description.value || '—'}</p>
            {/each}
            <h4 class="col-span-3 mt-6 border-b border-border pb-2 font-medium">Status</h4>
            <label class="my-3 flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={output.profileEdits!.isIntangible} /> Historical Feature</label>
            <button class="self-center rounded-full border border-border p-2" aria-label="Use candidate historical status" onclick={()=>output!.profileEdits!.isIntangible=candidate.content.profile.isIntangible}>←</button>
            <p class="my-3 text-sm">{candidate.content.profile.isIntangible ? 'Historical' : 'Current'}</p>
            <label class="my-3 flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={output.profileEdits!.isVisitable} /> Visitable</label>
            <button class="self-center rounded-full border border-border p-2" aria-label="Use candidate visitability" onclick={()=>output!.profileEdits!.isVisitable=candidate.content.profile.visitability.isVisitable}>←</button>
            <p class="my-3 text-sm">{candidate.content.profile.visitability.isVisitable ? 'Visitable' : 'Not visitable'}</p>
            <label class="my-3 grid gap-1 text-xs">Last Seen<input type="date" class={field} value={output.profileEdits!.asOf ?? ''} oninput={event=>output!.profileEdits!.asOf=event.currentTarget.value||null} /></label><span></span>
            <p class="my-3 self-center text-sm">{candidate.content.profile.visitability.asOf ?? 'No observation date'}</p>
            <p class="col-span-3 text-xs text-muted-foreground">Last Seen keeps the latest reviewed observation date.</p>
            <h4 class="col-span-3 mt-6 border-b border-border pb-2 font-medium">Location</h4>
            <p class={`my-3 whitespace-normal break-words rounded-lg p-3 text-sm ${!output.placementSourceFeatureId || output.placementSourceFeatureId===primary.featureId ? 'bg-primary/10' : ''}`}>{primary.content.translations[locale]?.address.value || 'Primary location'}</p>
            <button class="self-center rounded-full border border-border p-2" aria-label="Switch inherited location" onclick={()=>output!.placementSourceFeatureId=output!.placementSourceFeatureId===candidate.featureId?primary.featureId:candidate.featureId}>⇄</button>
            <p class={`my-3 whitespace-normal break-words rounded-lg p-3 text-sm ${output.placementSourceFeatureId===candidate.featureId ? 'bg-primary/10' : ''}`}>{candidate.content.translations[locale]?.address.value || 'Candidate location'}</p>
            <h4 class="col-span-3 mt-6 border-b border-border pb-2 font-medium">Fields</h4>
            {#each propertyIds as id}
              {@const chosen = output.properties?.find(row => row.propertyId === id)}
              <div class={`my-2 min-w-0 rounded-lg p-3 text-sm ${chosen?.sourceFeatureId === primary.featureId ? 'bg-primary/10' : ''}`}><p class="text-xs text-muted-foreground">{primary.content.properties[id]?.selection.definition.labels.en?.value ?? candidate.content.properties[id]?.selection.definition.labels.en?.value ?? primary.content.properties[id]?.selection.definition.key ?? candidate.content.properties[id]?.selection.definition.key}</p><p class="whitespace-normal break-words">{propertyText(primary,id)}</p></div>
              <button class="self-center rounded-full border border-border p-2" disabled={busy || !primary.content.properties[id] || !candidate.content.properties[id]} aria-label={`Switch value for ${id}`} onclick={() => { if (chosen) { chosen.sourceFeatureId = chosen.sourceFeatureId === primary.featureId ? candidate.featureId : primary.featureId; delete output!.propertyEdits![id] } }}>⇄</button>
              <div class={`my-2 min-w-0 rounded-lg p-3 text-sm ${chosen?.sourceFeatureId === candidate.featureId ? 'bg-primary/10' : ''}`}><p class="text-xs text-muted-foreground">{primary.content.properties[id]?.selection.definition.labels.en?.value ?? candidate.content.properties[id]?.selection.definition.labels.en?.value ?? primary.content.properties[id]?.selection.definition.key ?? candidate.content.properties[id]?.selection.definition.key}</p><p class="whitespace-normal break-words">{propertyText(candidate,id)}</p></div>
              {@const selectedField = sources.find(source=>source.featureId===chosen?.sourceFeatureId)?.content.properties[id]?.selection}
              {#if selectedField && !selectedField.propertyValueId && ['text','number','link','date'].includes(selectedField.definition.dataType) && !(primary.content.placement.location && selectedField.definition.component==='PhoneField')}
                <label class="col-span-3 mb-3 grid gap-1 text-xs">Selected value
                  <input class={field} value={output.propertyEdits?.[id] ?? selectedField.value ?? ''} disabled={busy} oninput={event=>output!.propertyEdits![id]=event.currentTarget.value||null} />
                </label>
              {/if}
            {/each}
          </div>
          <section class="space-y-3"><h4 class="border-b border-border pb-2 font-medium">Photos</h4><p class="text-sm text-muted-foreground">Select photos to carry over. Original attribution is retained.</p>
            <div class="grid grid-cols-3 gap-3 sm:grid-cols-6">{#each sources as source}{#each source.content.gallery.order as imageId}
              {@const selected = output.images?.some(row => row.imageId === imageId)}
              <button class={`relative aspect-square overflow-hidden rounded-lg border-2 ${selected ? 'border-primary' : 'border-transparent opacity-50'}`} disabled={busy} aria-pressed={selected} aria-label={`Include photo from ${identityTitle(source)}`} onclick={() => { output!.images = output!.images!.filter(row => row.imageId !== imageId); if (!selected) output!.images.push({sourceFeatureId:source.featureId,imageId}); if (!output!.images.some(row=>row.imageId===output!.coverImageId)) output!.coverImageId=output!.images[0]?.imageId }}><img src={identityPhoto(source,imageId)} alt="" class="h-full w-full object-cover" /><span class="absolute right-1 top-1 rounded-full bg-background px-1 text-sm">{selected ? '✓' : '+'}</span></button>
            {/each}{/each}</div>
          </section>
        {/if}
      {/if}
      <div class="flex justify-end gap-3 border-t border-border pt-4">
        <Dialog.Close class={action} disabled={busy}>Cancel</Dialog.Close>
        <button class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content disabled:opacity-40" disabled={busy || !primary || (kind === 'split' ? names.some(name => !name.trim()) : !candidate)} onclick={apply}>{busy ? 'Working…' : kind === 'split' ? 'Create two Features' : 'Merge Features'}</button>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
