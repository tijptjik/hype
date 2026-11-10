<script lang="ts">
// SVELTE
import { setContext } from 'svelte'
// CONTEXT
import { ADMINCTX_KEY } from '#lib/context/admin.svelte.js'
import { setResponsiveCtx } from '#lib/context/responsive.svelte.js'
// COMPONENTS
import Deferred from '#lib/bits/custom/deferred/Deferred.svelte'
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import ResourceLoadingState from '#lib/bits/patterns/resource/resourceIndex/components/ResourceLoadingState.svelte'
import ScopedFeatureIndexSkeleton from '#lib/bits/patterns/resource/adminFeatureIndex/ScopedFeatureIndexSkeleton.svelte'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'
import IndexCard from '#lib/bits/patterns/cards/indexCard/IndexCard.svelte'
import MapAddressConflict from '#lib/bits/patterns/forms/formFeatureAddress/MapAddressConflict.svelte'
import RelocationPolicySection from '#lib/bits/patterns/forms/locationUpdatePolicy/RelocationPolicySection.svelte'
import IntentChoiceCard from '#lib/bits/patterns/forms/featureIntent/IntentChoiceCard.svelte'
import MessagingAccountCard from '#lib/bits/patterns/messaging/MessagingAccountCard.svelte'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
const params = new URLSearchParams(window.location.search)
const kind = params.get('kind') ?? 'feature'
const layout = params.get('layout') ?? 'card'
const tall = params.get('tall') === '1'
const task = params.get('task') === '1'
setResponsiveCtx()
setContext(ADMINCTX_KEY, {
  listUi: { state: { layoutMode: { feature: layout } } },
  view: { panels: { isPanelOpenOrVisual: () => false } },
})
let stage = $state(0)
let resolve: (value: boolean) => void = () => {}
const entities = Array.from({ length: 8 }, (_, i) => ({ id: String(i) })) as Feature[]
function load(): Promise<boolean> {
  return new Promise(done => (resolve = done))
}
function next(): void {
  stage++
  if (stage === 1) resolve(true)
}
</script>
<div class="bits-theme bg-panel text-foreground min-h-screen">
  <button type="button" class="p-2" onclick={next}>Resolve next</button>
  {#if kind === 'feature'}
    <div
      class="flex min-h-0 w-full flex-col"
      style:height={tall ? '1400px' : '600px'}
      data-footprint
    >
      <Deferred {load}>
        {#snippet pending()}
          {#if task}
            <ResourceLoadingState isRowLayout showGroupHeader />
          {:else}
            <ScopedFeatureIndexSkeleton />
          {/if}
        {/snippet}
        {#snippet children()}
          <ResourceIndex
            resource={FirstClassResource.feature}
            {entities}
            isInitialised={stage === 2}
          >
            {#snippet card(entity)}
              <div data-geometry-item>
                <IndexCard
                  title={`Feature ${entity.id}`}
                  description="An address"
                  imageAlt="Feature"
                  imageSrc=""
                />
              </div>
            {/snippet}
            {#snippet row(entity)}
              <div
                data-geometry-item
                class="border-border flex h-18 items-center gap-4 rounded-xl border px-4"
              >
                <div class="bg-foreground/10 size-10 rounded-lg"></div>
                <span>Feature {entity.id}</span>
              </div>
            {/snippet}
          </ResourceIndex>
        {/snippet}
      </Deferred>
    </div>
  {:else if kind === 'button'}
    <div data-footprint class="p-6">
      <MapAddressConflict
        conflicts={[]}
        busy={stage === 0}
        onAccept={() => {}}
        onReview={() => {}}
      />
    </div>
  {:else}
    <div data-footprint class="p-6">
      {#if stage === 0}
        <ContentSkeleton>{@render content()}</ContentSkeleton>
      {:else}
        {@render content()}
      {/if}
    </div>
  {/if}
</div>
{#snippet content()}
  {#if kind === 'policy'}
    <RelocationPolicySection
      value="review"
      isEditing
      saving={stage === 0}
      onValueChange={() => {}}
    />
  {:else if kind === 'account'}
    <div class="flex flex-wrap gap-4">
      {#each ['whatsapp', 'telegram'] as platform}
        <MessagingAccountCard
          platform={platform as 'whatsapp' | 'telegram'}
          busy={stage === 0}
          onAction={async () => {}}
        />
      {/each}
    </div>
  {:else}
    <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
      {#each [
        'A destination, such as a bookstore, café or community venue.',
        'An individual item, such as a tree, sign, sculpture or drinking fountain.',
      ] as description}
        <IntentChoiceCard
          label="Feature type"
          {description}
          selected={false}
          onclick={() => {}}
          >{#snippet icon()}
            <span class="size-7"></span>
          {/snippet}</IntentChoiceCard
        >
      {/each}
    </div>
  {/if}
{/snippet}
