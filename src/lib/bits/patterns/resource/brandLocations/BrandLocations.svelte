<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { goto } from '$app/navigation'
// API
import {
  getBrandLocations,
  discoverBrandLocations,
  addBrandLocationCandidate,
} from '#lib/api/brandLocations.remote.js'
import { getLocations } from '#lib/api/locationDirectory.remote.js'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import { SimpleTooltip } from '#lib/bits/core/tooltip/index.js'
import MatchIcon from 'virtual:icons/lucide/badge-check'
import NameIcon from 'virtual:icons/lucide/search-check'
import NoNameIcon from 'virtual:icons/lucide/search-x'
import HypeMarkIcon from '#lib/bits/patterns/cards/resourceCard/components/HypeMarkIcon.svelte'
import LinkedIcon from 'virtual:icons/lucide/link'
import UnlinkedIcon from 'virtual:icons/lucide/unlink'
import AddIcon from 'virtual:icons/lucide/map-pin-plus'
import type { Component } from 'svelte'
import { Button } from '#lib/bits/core/index.js'
import { TextInput } from '#lib/bits/custom/form/index.js'
import SearchSelect from '#lib/bits/core/searchSelect/SearchSelect.svelte'
import TriStateToggle from '#lib/bits/patterns/resource/resourceControlBar/components/ResourceControlBarTriStateToggle.svelte'
import LocationIdentityReviewSection from '#lib/bits/patterns/forms/featureLocation/LocationIdentityReviewSection.svelte'
import ResourceIcon from '#lib/bits/custom/resourceIcon/ResourceIcon.svelte'
import Row from '#lib/bits/custom/rows/Row.svelte'
import LocationIcon from 'virtual:icons/lucide/map-pinned'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
import { getAdminCtx } from '#lib/context/admin.svelte.js'
// DOMAIN
import { getLocaleKey } from '#lib/i18n.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
import { placeTaxonomy, type PlaceTaxonomyNode } from '#lib/locations/placeTaxonomy.js'
import { placeCategoryLabel } from '#lib/locations/placeSearchFilters.js'
import type { IdentityCatalogueRecord } from '#lib/locations/identityCatalogue.js'
import type { LocationResource } from '#lib/locations/resource.js'

let {
  brand,
  organisationId,
}: { brand: IdentityCatalogueRecord; organisationId?: string } = $props()
const header = getHeaderCtrl(),
  admin = getAdminCtx()
let q = $state(untrack(() => brand.discovery?.terms[0] ?? brand.i18n.en.name))
let category = $state(untrack(() => brand.discovery?.category ?? ''))
let hype = $state<boolean | null>(false),
  upstream = $state<boolean | null>(null),
  linked = $state<boolean | null>(null)
let busy = $state(false),
  failure = $state(''),
  searched = $state(false)
let localRows = $state<LocationResource[]>([])
type Candidate = Awaited<ReturnType<typeof discoverBrandLocations>>['rows'][number]
let sourceRows = $state<Candidate[]>([])
let localCursor = $state<string | null>(null),
  sourceCursor = $state<string | null>(null)
let targetSearch = $state(''),
  targetId = $state(''),
  selectedCandidate = $state<Candidate | null>(null)
let review = $state<{ locationId: string; reviewId: string } | null>(null)
let generation = 0
/** Flatten the existing taxonomy for the standard category picker. @param nodes Taxonomy subtree. @returns Selectable identifiers. */
function categories(nodes: PlaceTaxonomyNode[]): string[] {
  return nodes.flatMap(node => [node.name, ...categories(node.children ?? [])])
}
const categoryOptions = categories(placeTaxonomy)
const targetRequest = $derived(
  selectedCandidate && targetSearch.trim()
    ? getLocations({ q: targetSearch, organisationId, includeCount: false })
    : null,
)
$effect(() => {
  header.setSearch({
    query: q,
    indexView: true,
    placeholder: 'Search locations',
    onFilter: value => {
      q = value.slice(0, 200)
    },
  })
})
// Changes invalidate earlier responses; source searches remain an explicit action.
$effect(() => {
  q
  category
  hype
  upstream
  linked
  generation++
  searched = false
  sourceRows = []
  localRows = []
  localCursor = null
  sourceCursor = null
  failure = ''
  busy = false
})
onDestroy(() => {
  generation++
  header.setSearch(null)
})
/** Navigate without losing the organisation access context. @param id Location identity. @returns Detail URL. */
function href(id: string): string {
  return `/admin/locations/${encodeURIComponent(id)}${organisationId ? `?organisation=${encodeURIComponent(organisationId)}` : ''}`
}
/** Execute independent local/source pages and preserve explicit continuations. @param more Optional page stream. @returns Completion after all requested reads. */
async function search(more?: 'local' | 'source'): Promise<void> {
  const token = ++generation
  busy = true
  failure = ''
  try {
    const [localResult, sourceResult] = await Promise.allSettled([
      hype !== false && more !== 'source'
        ? getBrandLocations({
            brandId: brand.id,
            organisationId,
            upstream: upstream ?? undefined,
            linkedFeatures: linked ?? undefined,
            after: more === 'local' ? (localCursor ?? undefined) : undefined,
          })
        : null,
      upstream !== false && more !== 'local'
        ? discoverBrandLocations({
            brandId: brand.id,
            organisationId,
            q,
            locale:
              getLocaleKey() === 'zhHant'
                ? 'zh-hant'
                : getLocaleKey() === 'zhHans'
                  ? 'zh-hans'
                  : 'en',
            filters: category ? { taxonomyCategory: category } : undefined,
            hype: hype ?? undefined,
            linkedFeatures: linked ?? undefined,
            cursor: more === 'source' ? (sourceCursor ?? undefined) : undefined,
          })
        : null,
    ])
    if (token !== generation) return
    const local = localResult.status === 'fulfilled' ? localResult.value : null
    const source = sourceResult.status === 'fulfilled' ? sourceResult.value : null
    if (localResult.status === 'rejected' || sourceResult.status === 'rejected')
      failure = `${localResult.status === 'rejected' ? 'Hype' : 'SaanSeoi'} search failed. Retry the search.`
    if (local) {
      localRows = more ? [...localRows, ...local.data] : local.data
      localCursor = local.nextCursor
    } else if (!more) {
      localRows = []
      localCursor = null
    }
    if (source) {
      sourceRows = [
        ...new Map(
          [...(more ? sourceRows : []), ...source.rows].map(row => [row.ssId, row]),
        ).values(),
      ]
      sourceCursor = source.nextCursor
    } else if (!more) {
      sourceRows = []
      sourceCursor = null
    }
    searched = true
  } catch {
    if (token === generation) failure = 'Unable to load locations. Retry the search.'
  } finally {
    if (token === generation) busy = false
  }
}
/** Add exact evidence or open the existing identity comparison. @param candidate Explicit user selection. @param locationId Optional target. @returns Completion. */
async function add(candidate: Candidate, locationId?: string): Promise<void> {
  busy = true
  failure = ''
  try {
    const result = await addBrandLocationCandidate({
      brandId: brand.id,
      organisationId,
      ssId: candidate.ssId,
      resourceReleaseId: candidate.resourceReleaseId,
      locationId,
    })
    if (result.reviewId)
      review = { locationId: result.locationId, reviewId: result.reviewId }
    else await goto(href(result.locationId))
  } catch {
    failure = 'Unable to add this candidate. Its source may have changed; search again.'
  } finally {
    busy = false
  }
}
</script>

{#snippet statusIcon(
  Icon: Component<{ class?: string }>,
  label: string,
  positive = false,
)}
  <SimpleTooltip>
    {#snippet trigger()}
      <button
        type="button"
        class="inline-flex"
        aria-label={label}
        onclick={event => event.stopPropagation()}
        onkeydown={event => event.stopPropagation()}
      >
        <Icon
          class={positive ? 'text-success size-5' : 'text-muted-foreground size-5'}
        />
      </button>
    {/snippet}
    {#snippet children()}
      {label}
    {/snippet}
  </SimpleTooltip>
{/snippet}

<div class="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6" data-brand-locations>
  <div
    class="border-border flex flex-wrap items-center gap-x-10 gap-y-5 rounded-lg border px-6 py-4"
  >
    <TriStateToggle
      label="Hype"
      falseLabel="Not added"
      trueLabel="Added"
      currentValue={hype}
      onCheckedChange={value => (hype = value)}
    />
    <TriStateToggle
      label="Upstream"
      falseLabel="Community only"
      trueLabel="Backed"
      currentValue={upstream}
      onCheckedChange={value => (upstream = value)}
    />
    <TriStateToggle
      label="Linked Features"
      falseLabel="Unlinked"
      trueLabel="Linked"
      currentValue={linked}
      onCheckedChange={value => (linked = value)}
    />
  </div>
  <div class="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
    <SearchSelect
      label="Search term"
      plain
      items={[
        ...new Set([
          ...(brand.discovery?.terms ?? []),
          ...Object.values(brand.i18n).map(value => value.name),
        ]),
      ].map(value => ({ value, label: value }))}
      onSelect={value => {
        if (value) q = value
      }}
    />
    <SearchSelect
      label="Upstream category"
      plain
      value={category}
      items={categoryOptions.map(value => ({
        value,
        label: placeCategoryLabel(value),
      }))}
      onSelect={value => (category = value ?? '')}
    />
    <Button
      text={upstream === false ? 'Search Hype' : 'Search SaanSeoi'}
      disabled={busy || !q.trim()}
      onClick={() => search()}
    />
  </div>
  {#if category}
    <Button
      text={`Clear category: ${placeCategoryLabel(category)}`}
      style="ghost"
      size="sm"
      onClick={() => (category = '')}
    />
  {/if}
  <p class="text-muted-foreground text-sm">
    Branches found, not a complete branch census. Name matches need confirmation before
    assigning a brand.
  </p>
  {#if failure}
    <p role="alert">{failure}</p>
  {/if}
  {#if busy && (localRows.length || sourceRows.length)}
    <span role="status" aria-label="Loading locations" class="sr-only"
      >Updating locations</span
    >
  {:else if busy}
    <div role="status" aria-label="Loading locations" class="grid gap-1.5">
      <span class="sr-only">Loading locations</span>
      {#each Array(localRows.length || sourceRows.length ? 2 : 6) as _, index}
        <div aria-hidden="true" data-location-row-skeleton>
          <Row
            {index}
            variant="resource"
            interactive={false}
            isFocusable={false}
            onclick={() => undefined}
            onkeydown={() => undefined}
            class="grid-cols-[minmax(0,1fr)_auto] pr-4"
          >
            <div class="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
              <Skeleton class="size-16 rounded-md" />
              <div class="grid min-w-0 gap-2 py-2">
                <Skeleton class="h-4 w-40 max-w-full" />
                <Skeleton class="h-3 w-80 max-w-full" />
              </div>
            </div>
            <div
              class="flex max-w-[min(36rem,55cqw)] flex-wrap items-center justify-end gap-x-8 gap-y-2 py-1"
            >
              <div class="flex items-center gap-4">
                {#each [0, 1, 2] as icon (icon)}
                  <Skeleton class="size-5 rounded-full" />
                {/each}
              </div>
              <div class="flex gap-2">
                <Skeleton class="h-8 w-32 rounded-xl" />
                {#if hype !== true}
                  <Skeleton class="h-8 w-32 rounded-xl" />
                {/if}
              </div>
            </div>
          </Row>
        </div>
      {/each}
    </div>
  {/if}
  {#if searched}
    {#each localRows as row, index (row.id)}
      <Row
        {index}
        variant="resource"
        entityId={row.id}
        title={row.facts?.names?.[canonicalContentTag(getLocaleKey())] ??
          row.facts?.names?.en ??
          row.id}
        description=""
        class="grid-cols-[minmax(0,1fr)_auto] pr-4"
        onclick={() => goto(href(row.id))}
        onkeydown={event => {
          if (event.key === 'Enter') void goto(href(row.id))
        }}
      >
        {#snippet imageFallback()}
          <ResourceIcon src={brand.logo} class="m-2 size-12" />
        {/snippet}
        <div class="flex items-center gap-8">
          <div class="flex items-center gap-4">
            {@render statusIcon(MatchIcon, 'Confirmed brand match', true)}
            {@render statusIcon(HypeMarkIcon, 'Available in Hype', true)}
            {@render statusIcon(
              row.hasLinkedFeatures ? LinkedIcon : UnlinkedIcon,
              row.hasLinkedFeatures ? 'Has linked features' : 'No linked features',
              Boolean(row.hasLinkedFeatures),
            )}
          </div>
          <Button
            text="Show Location"
            iconComponent={LocationIcon}
            style="outline"
            size="sm"
            href={href(row.id)}
          />
        </div>
      </Row>
    {/each}
    {#each sourceRows.filter(
      row => !localRows.some(local => local.id === row.locationId),
    ) as row, index (row.ssId)}
      <Row
        index={localRows.length + index}
        entityId={row.ssId}
        variant="resource"
        class="grid-cols-[minmax(0,1fr)_auto] pr-4"
        interactive={Boolean(row.locationId)}
        isFocusable={Boolean(row.locationId)}
        onclick={() => {
          if (row.locationId) void goto(href(row.locationId))
        }}
        onkeydown={event => {
          if (
            event.key === 'Enter' &&
            row.locationId &&
            event.target === event.currentTarget
          )
            void goto(href(row.locationId))
        }}
      >
        <div class="grid min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-4">
          <div class="bg-base-200 flex size-16 items-center justify-center rounded-md">
            {#if row.match === 'brand'}
              <ResourceIcon src={brand.logo} class="size-12" />
            {:else}
              <LocationIcon class="size-8" />
            {/if}
          </div>
          <div class="min-w-0 py-2">
            <div class="text-base font-semibold break-words whitespace-normal">
              {row.name}
            </div>
            <div class="text-muted-foreground text-sm break-words whitespace-normal">
              {row.ssId}
            </div>
          </div>
        </div>
        <div
          class="flex max-w-[min(36rem,55cqw)] flex-wrap items-center justify-end gap-x-8 gap-y-2 py-1"
        >
          <div class="text-muted-foreground flex items-center gap-4">
            {@render statusIcon(
              row.match === 'brand'
                ? MatchIcon
                : row.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())
                  ? NameIcon
                  : NoNameIcon,
              row.match === 'brand'
                ? 'Confirmed brand match'
                : row.name.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase())
                  ? 'Name matches search'
                  : 'Name does not match search text',
              row.match === 'brand',
            )}
            <SimpleTooltip>
              {#snippet trigger()}
                <button
                  type="button"
                  class="relative inline-flex size-5"
                  onclick={event => event.stopPropagation()}
                  onkeydown={event => event.stopPropagation()}
                  aria-label={row.locationId ? 'Available in Hype' : 'Not yet in Hype'}
                >
                  <HypeMarkIcon class="text-muted-foreground size-5" />
                  {#if !row.locationId}
                    <svg
                      class="text-muted-foreground/70 pointer-events-none absolute inset-0 size-5"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M2 14L14 2"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                  {/if}
                </button>
              {/snippet}
              {#snippet children()}
                {row.locationId ? 'Available in Hype' : 'Not yet in Hype'}
              {/snippet}
            </SimpleTooltip>
            {@render statusIcon(
              row.linked ? LinkedIcon : UnlinkedIcon,
              row.linked ? 'Has linked features' : 'No linked features',
              row.linked,
            )}
          </div>
          {#if row.locationId}
            <a
              href={href(row.locationId)}
              aria-label="Open Location"
              title="Open Location"
              ><LocationIcon class="size-5" /></a
            >
          {:else if admin.view.isSuperAdmin()}
            <div class="flex flex-wrap justify-end gap-2">
              <SimpleTooltip>
                {#snippet trigger()}
                  <Button
                    text="Link Location"
                    iconComponent={LinkedIcon}
                    size="sm"
                    style="outline"
                    disabled={busy}
                    onClick={() => {
                      selectedCandidate = row
                      targetSearch = row.name
                      targetId = ''
                      review = null
                    }}
                  />
                {/snippet}
                {#snippet children()}
                  Choose an existing Hype location and review linking it to this
                  SaanSeoi record.
                {/snippet}
              </SimpleTooltip>
              <SimpleTooltip>
                {#snippet trigger()}
                  <Button
                    text="Add Location"
                    iconComponent={AddIcon}
                    size="sm"
                    style="outline"
                    color="primary"
                    disabled={busy}
                    onClick={() => add(row)}
                  />
                {/snippet}
                {#snippet children()}
                  Create a Hype location from this SaanSeoi record.
                {/snippet}
              </SimpleTooltip>
            </div>
          {/if}
        </div>
      </Row>
    {/each}
    {#if localCursor}
      <Button
        text="More Hype locations"
        style="outline"
        disabled={busy}
        onClick={() => search('local')}
      />
    {/if}
    {#if sourceCursor}
      <Button
        text="More from SaanSeoi"
        style="outline"
        disabled={busy}
        onClick={() => search('source')}
      />
    {/if}
    {#if !localRows.length && !sourceRows.length}
      <p>
        No matching locations on this page.{sourceCursor
          ? ' Continue to the next source page.'
          : ''}
      </p>
    {/if}
  {/if}
  {#if selectedCandidate}
    <section
      class="border-border grid gap-4 rounded-lg border p-5"
      aria-label="Link existing Location"
    >
      <h3>Link {selectedCandidate.name}</h3>
      <TextInput label="Find existing Location" bind:value={targetSearch} />
      <SearchSelect
        label="Existing Location"
        plain
        items={(targetRequest?.current?.data ?? [])
          .filter(row => row.state !== 'manual')
          .map(row => ({ value: row.id, label: row.facts?.names?.en ?? row.id }))}
        value={targetId}
        onSelect={value => (targetId = value ?? '')}
      />
      <div class="flex gap-3">
        <Button
          text="Review link"
          disabled={busy || !targetId}
          onClick={() => selectedCandidate && add(selectedCandidate, targetId)}
        /><Button
          text="Cancel"
          style="ghost"
          onClick={() => {
            selectedCandidate = null
            review = null
          }}
        />
      </div>
      {#if review}
        <LocationIdentityReviewSection
          featureId=""
          locationId={review.locationId}
          initialReviewId={review.reviewId}
          isDirty={false}
          onCommitted={async () => {
            if (review) await goto(href(review.locationId))
          }}
        />
      {/if}
    </section>
  {/if}
</div>
