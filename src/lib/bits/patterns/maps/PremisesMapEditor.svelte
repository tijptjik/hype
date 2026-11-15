<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { page } from '$app/state'
// NAVIGATION
import { resolveTitle } from '#lib/navigation/title.js'
// CONTEXT
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// ICONS
import MapIcon from 'virtual:icons/proicons/map'
// API
import {
  listPremisesMaps,
  getPremisesMapPublicationChanges,
  correctPremisesMapLabel,
  removePremisesMapCorrection,
  getPremisesMapDraft,
  savePremisesMapDraft,
  publishPremisesMapDraft,
  restorePremisesMapDraft,
} from '#lib/api/premisesMaps.remote.js'
// BITS COMPONENTS
import { Button } from '#lib/bits/core/index.js'
import { SectionHeader, SelectField, TextInput } from '#lib/bits/custom/form/index.js'
// COMPONENTS
import * as Main from '#lib/bits/custom/main/index.js'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import Tabs from '#lib/bits/core/tabs/Tabs.svelte'
import ConnectionMapEditor from './ConnectionMapEditor.svelte'
// TYPES
import type { MapConnection } from '#lib/indoor/releases.js'
let maps = $state.raw<Awaited<ReturnType<typeof listPremisesMaps>>>([])
let selected = $state('')
let loaded = $state.raw<Awaited<ReturnType<typeof getPremisesMapDraft>> | null>(null)
let connections = $state<MapConnection[]>([])
let busy = $state(false)
let message = $state('')
let inspectedVersion = $state<number | null>(null)
let publication = $state.raw<Awaited<
  ReturnType<typeof getPremisesMapPublicationChanges>
> | null>(null)
let correctionLevel = $state('')
let correctionField = $state<'level_name_en' | 'level_name_zh' | 'level_short_name_en'>(
  'level_name_en',
)
let correctionValue = $state('')
let correctionReason = $state('')
const header = getHeaderCtrl()
let tab = $state('connections')
let connectionFloors = $state('')
const editorTabs = [
  { value: 'connections', label: 'Floor connections' },
  { value: 'labels', label: 'Level labels' },
  { value: 'corrections', label: 'Saved corrections' },
  { value: 'history', label: 'Published history' },
]
const premisesName = $derived(
  maps.find(map => map.id === selected)?.name ?? 'Premises maps',
)
const titleDetail = $derived(
  tab === 'connections'
    ? connectionFloors || 'Floor connections'
    : tab === 'labels'
      ? String(
          loaded?.bundle?.data.level_polygon.features.find(
            level => String(level.properties.level_id) === correctionLevel,
          )?.properties.level_name_en ?? 'Level labels',
        )
      : tab === 'history' && inspectedVersion !== null
        ? `Published history · Version ${inspectedVersion}`
        : editorTabs.find(item => item.value === tab)?.label,
)
const documentTitle = $derived(
  resolveTitle(
    `${premisesName}${titleDetail ? ` · ${titleDetail}` : ''} · HYPE.HK`,
    page.data.titleEnvironmentLabel,
  ),
)

$effect(() => {
  const title = premisesName
  untrack(() => {
    header.setHeaderForEntity(title, MapIcon, new Map(), {
      showNew: false,
      showFilter: false,
      showFacets: false,
      showFormActions: false,
      showViewActions: false,
    })
    header.setSearch(null)
    header.setCreateAction(null)
    header.clearControlBar()
    header.setCrumbs([{ name: 'Premises maps', href: '/admin/premises-maps' }])
  })
})
onDestroy(() => {
  header.setSearch(null)
  header.setCreateAction(null)
})
let dirty = $derived(
  loaded?.bundle
    ? JSON.stringify(connections) !==
        JSON.stringify(loaded.bundle.data.connections ?? [])
    : false,
)
/** Load the exact draft and concurrency fences. @returns Completion. */
async function load(): Promise<void> {
  if (!selected) return
  connectionFloors = ''
  const query = getPremisesMapDraft({ id: selected })
  await query.refresh()
  loaded = await query
  connections = structuredClone(loaded.bundle?.data.connections ?? [])
  inspectedVersion = null
  publication = null
  correctionLevel = ''
  correctionValue = ''
  correctionReason = ''
}
/** Handle an editor operation and retain actionable server errors. @param action Authorized remote operation. @returns Completion. */
async function run(action: () => Promise<void>): Promise<void> {
  busy = true
  message = ''
  try {
    await action()
  } catch (error) {
    message = error instanceof Error ? error.message : 'Map update failed'
  } finally {
    busy = false
  }
}
$effect(() => {
  untrack(() => {
    void run(async () => {
      maps = await listPremisesMaps({})
      selected =
        maps.find(map => map.id === page.url.searchParams.get('map'))?.id ??
        maps[0]?.id ??
        ''
      await load()
    })
  })
})
</script>

<svelte:head><title>{documentTitle}</title></svelte:head>

<Main.Root class="min-h-0 overflow-y-auto! overscroll-contain px-0! pt-0!">
  <FormSurface>
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-8 p-6 pb-12">
      <div>
        <h1 class="text-2xl font-semibold">Map editor</h1>
        <p class="text-muted-foreground mt-2">
          Edit connections in a draft, then publish a complete map version.
        </p>
      </div>
      <SelectField
        label="Map"
        placeholder="Choose a map"
        bind:value={selected}
        items={maps.map(map => ({ value: map.id, label: map.name }))}
        disabled={busy || dirty}
        onValueChange={() => run(load)}
      />
      {#if busy && !loaded}
        <div
          role="status"
          aria-busy="true"
          aria-label="Loading map"
          class="grid animate-pulse gap-4"
        >
          <div class="bg-muted h-12 rounded-lg"></div>
          <div class="bg-muted h-[28rem] rounded-lg"></div>
        </div>
      {/if}
      {#if loaded?.bundle}
        <div class="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
          <span
            >Published version {loaded.map.publishedVersion} · Draft revision
            {loaded.map.draftVersion}</span
          >
          {#if dirty}
            <span class="bg-primary/10 text-primary rounded-full px-3 py-1"
              >Unsaved changes</span
            >
          {/if}
        </div>
        <Tabs
          bind:value={tab}
          items={editorTabs}
          label="Premises map editor"
          panelClass="pt-5"
        >
          {#snippet children(activeTab)}
            {#if loaded?.bundle}
              {#if activeTab === 'connections'}
                <section class="border-border overflow-hidden rounded-xl border">
                  <div class="p-5">
                    {#key selected}
                      <ConnectionMapEditor
                        data={loaded.bundle.data}
                        onFloorsChange={label => {
                          connectionFloors = label
                        }}
                        bind:connections
                        disabled={busy}
                      />
                    {/key}
                  </div>
                </section>
              {:else if activeTab === 'labels'}
                <section class="border-border overflow-hidden rounded-xl border">
                  <SectionHeader
                    title="Level labels"
                    description="Correct a label in the draft before publishing."
                  />
                  <div class="grid gap-4 p-5 md:grid-cols-2">
                    <SelectField
                      label="Level"
                      placeholder="Choose a level"
                      bind:value={correctionLevel}
                      disabled={busy || dirty}
                      items={loaded.bundle.data.level_polygon.features.map(level => ({
                        value: String(level.properties.level_id),
                        label: String(level.properties.level_name_en),
                      }))}
                    />
                    <SelectField
                      label="Label"
                      value={correctionField}
                      onValueChange={next => {
                        if (
                          next === 'level_name_en' ||
                          next === 'level_name_zh' ||
                          next === 'level_short_name_en'
                        )
                          correctionField = next
                      }}
                      disabled={busy || dirty}
                      items={[
                        { value: 'level_name_en', label: 'English name' },
                        { value: 'level_name_zh', label: 'Chinese name' },
                        { value: 'level_short_name_en', label: 'Short name' },
                      ]}
                    />
                    <TextInput
                      label="Corrected label"
                      bind:value={correctionValue}
                      disabled={busy || dirty}
                      inputAttrs={{ maxlength: 200 }}
                    />
                    <TextInput
                      label="Reason"
                      bind:value={correctionReason}
                      disabled={busy || dirty}
                      inputAttrs={{ maxlength: 1000 }}
                    />
                    <Button
                      type="button"
                      disabled={busy ||
                        dirty ||
                        !correctionLevel ||
                        !correctionValue.trim() ||
                        !correctionReason.trim()}
                      onClick={() =>
                        run(async () => {
                          if (!loaded) return
                          await correctPremisesMapLabel({
                            id: selected,
                            expectedVersion: loaded.map.draftVersion,
                            levelId: correctionLevel,
                            field: correctionField,
                            value: correctionValue,
                            reason: correctionReason,
                          })
                          await load()
                          message =
                            'Correction saved in the draft. Publish to update the map.'
                        })}
                      style="outline"
                      size="sm"
                      text="Save label correction"
                    />
                  </div>
                </section>
              {:else if activeTab === 'corrections'}
                <section class="border-border overflow-hidden rounded-xl border">
                  <SectionHeader
                    title="Saved corrections"
                    description="Overrides applied to the upstream map source."
                  />
                  <div class="grid gap-4 p-5">
                    {#if !loaded.corrections.length}
                      <p class="text-muted-foreground text-sm">No saved corrections.</p>
                    {/if}
                    {#each loaded.corrections as correction}
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="min-w-0">
                          {#if correction.sourceLayer === 'connection'}
                            {@const pair = JSON.parse(
                              correction.correctedValue,
                            ) as MapConnection}
                            <p>
                              {pair.category}
                              · {pair.fromLevel} → {pair.toLevel} ·
                              {pair.enabled ? 'Enabled' : 'Disabled'}
                            </p>
                            <p class="text-sm">
                              Entrance sides:
                              {pair.fromEntrance
                                ? `part ${pair.fromEntrance.polygonIndex + 1}, edge ${pair.fromEntrance.edgeIndex + 1}`
                                : 'unknown'}
                              →
                              {pair.toEntrance
                                ? `part ${pair.toEntrance.polygonIndex + 1}, edge ${pair.toEntrance.edgeIndex + 1}`
                                : 'unknown'}
                            </p>
                          {:else}
                            <p>
                              {correction.originalValue ?? '(absent)'}
                              → {correction.correctedValue}
                            </p>
                          {/if}
                          <p class="text-muted-foreground text-xs">
                            Source: {correction.sourceDataset} ·
                            {correction.sourceLayer}
                          </p>
                          {#if correction.sourceLayer === 'connection'}
                            <details class="text-sm">
                              <summary class="cursor-pointer">
                                Compare with upstream
                              </summary>
                              <div class="mt-2 grid gap-3 sm:grid-cols-2">
                                <div>
                                  <p class="font-medium">Upstream</p>
                                  <pre
                                    class="overflow-auto text-xs break-all whitespace-pre-wrap"
                                  >{correction.originalValue ? JSON.stringify(JSON.parse(correction.originalValue), null, 2) : 'No connection'}</pre>
                                </div>
                                <div>
                                  <p class="font-medium">Saved override</p>
                                  <pre
                                    class="overflow-auto text-xs break-all whitespace-pre-wrap"
                                  >{JSON.stringify(JSON.parse(correction.correctedValue), null, 2)}</pre>
                                </div>
                              </div>
                            </details>
                          {/if}
                          <p class="text-sm">{correction.reason}</p>
                        </div>
                        <Button
                          type="button"
                          disabled={busy || dirty}
                          onClick={() =>
                            run(async () => {
                              if (!loaded) return
                              await removePremisesMapCorrection({
                                id: selected,
                                expectedVersion: loaded.map.draftVersion,
                                sourceDataset: correction.sourceDataset,
                                sourceLayer: correction.sourceLayer,
                                sourceEntityId: correction.sourceEntityId,
                                field: correction.field,
                              })
                              await load()
                              message =
                                'Correction removed from the draft. Publish to update the map.'
                            })}
                          style="outline"
                          size="sm"
                          text="Remove correction"
                        />
                      </div>
                    {/each}
                    {#if loaded.bundle.data.correctionIssues?.length}
                      <p role="alert">
                        This draft has unresolved source corrections. Resolve the
                        affected labels or connections before publishing.
                      </p>
                    {/if}
                  </div>
                </section>
              {:else if activeTab === 'history'}
                <section class="border-border overflow-hidden rounded-xl border">
                  <SectionHeader title="Published history" />
                  {#if !loaded.history.length}
                    <p class="text-muted-foreground p-5 text-sm">
                      No published versions yet.
                    </p>
                  {/if}
                  <ul class="space-y-3 p-5">
                    {#each loaded.history as release}
                      <li class="flex flex-wrap items-center gap-3">
                        <span>Version {release.version} · {release.createdAt}</span>
                        <Button
                          text="View changes"
                          style="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              inspectedVersion = release.version
                              publication = null
                              publication = await getPremisesMapPublicationChanges({
                                id: selected,
                                version: release.version,
                              })
                            })}
                        />

                        <Button
                          type="button"
                          disabled={busy || dirty}
                          onClick={() =>
                            run(async () => {
                              if (!loaded) return
                              await restorePremisesMapDraft({
                                id: selected,
                                hash: release.hash,
                                expectedVersion: loaded.map.draftVersion,
                              })
                              await load()
                              message =
                                'Previous release restored as a draft. Publish to activate it.'
                            })}
                          style="outline"
                          size="sm"
                          text="Restore as draft"
                        />
                      </li>
                    {/each}
                  </ul>
                  {#if inspectedVersion !== null}
                    <div class="border-border grid gap-4 border-t p-5">
                      <h3 class="font-semibold">Version {inspectedVersion} changes</h3>
                      {#if busy && !publication}
                        <div
                          role="status"
                          aria-label="Loading publication changes"
                          aria-busy="true"
                          class="bg-muted h-32 animate-pulse rounded-lg"
                        ></div>
                      {:else if publication}
                        <p class="text-muted-foreground text-sm">
                          Connections and level labels
                          {publication.previousVersion
                            ? `since version ${publication.previousVersion}`
                            : 'in the first publication'}.
                        </p>
                        {#each publication.changes as change}
                          <div class="border-border grid gap-2 border-b pb-3">
                            <p class="text-sm font-medium">{change.label}</p>
                            <p class="text-muted-foreground text-sm break-words">
                              {change.before}
                              → {change.after}
                            </p>
                          </div>
                        {:else}
                          <p class="text-muted-foreground text-sm">
                            No connection or level-label changes.
                          </p>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </section>
              {/if}
            {/if}
          {/snippet}
        </Tabs>
        <div class="border-border bg-muted/20 grid gap-4 border-t p-5">
          <div class="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy || !dirty}
              onClick={() =>
                run(async () => {
                  if (!loaded?.bundle) return
                  await savePremisesMapDraft({
                    id: selected,
                    expectedVersion: loaded.map.draftVersion,
                    connections: $state.snapshot(connections),
                  })
                  await load()
                  message = 'Draft saved. The published map is unchanged.'
                })}
              style="soft"
              color="primary"
              size="sm"
              text="Save connections"
            />
            <Button
              type="button"
              disabled={busy ||
                dirty ||
                !loaded.map.draftHash ||
                loaded.map.draftHash === loaded.map.publishedHash}
              onClick={() =>
                run(async () => {
                  if (!loaded?.map.draftHash) return
                  await publishPremisesMapDraft({
                    id: selected,
                    hash: loaded.map.draftHash,
                    expectedDraftVersion: loaded.map.draftVersion,
                    expectedPublishedVersion: loaded.map.publishedVersion,
                  })
                  await load()
                  message = 'Map published.'
                })}
              style="outline"
              size="sm"
              text="Publish saved draft"
            />
            <Button
              type="button"
              disabled={busy || !dirty}
              onClick={() => run(load)}
              style="outline"
              size="sm"
              text="Discard unsaved edits"
            />
            <a
              class="text-primary p-2 underline"
              href={`/${loaded.map.kind === 'building' ? 'buildings' : 'premises'}/${selected}`}
              >Open published map</a
            >
          </div>
        </div>
      {/if}
      {#if message}
        <p
          role="status"
          class="border-border bg-muted/30 rounded-lg border p-4 text-sm"
        >
          {message}
        </p>
      {/if}
    </div>
  </FormSurface>
</Main.Root>
