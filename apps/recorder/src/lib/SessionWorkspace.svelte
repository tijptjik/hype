<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { pushState, replaceState } from '$app/navigation'
import { page } from '$app/state'
// COMPONENTS
import Selector from './Selector.svelte'
import RealmSelector from './RealmSelector.svelte'
import SessionMap from './SessionMap.svelte'
// API
import {
  recordFeature,
  recorderLocations,
  recorderRecords,
  recorderSessions,
} from './api/recorderSessions.remote'
// TYPES
import type {
  RecorderLocation,
  RecorderRecord,
  RecorderPin,
  RecorderPlacement,
  SpatialRealm,
  RecorderOption,
  RecorderSession,
} from '../../../../src/lib/fieldResearch/recorder'

let {
  signOut,
  busy,
  message,
}: { signOut: () => void; busy: boolean; message: string } = $props()
let sessions = $state<RecorderSession[]>([])
let session = $state<RecorderSession | null>(null)
let places = $state<RecorderLocation[]>([])
let records = $state<RecorderRecord[]>([])
let screen = $state<'sessions' | 'session' | 'records'>('sessions')
let route = $derived(page.state.recorder)
let realm = $state<SpatialRealm>('interior')
let pin = $state<RecorderPin | null>(null)
let recordOnMap = $derived(records.find(row => row.id === route?.recordId))
let loading = $state(true)
let saving = $state(false)
let failure = $state('')
let notice = $state('')
let layerId = $state('')
let pendingRecord: {
  sessionId: string
  id: string
  layerId: string
  placement: RecorderPlacement
} | null = null
let request = 0
onDestroy(() => {
  request++
})
let premises = $state('')
let building = $state('')
let part = $state('')
let selectedId = $derived(part || building || premises)
let search = $state('')
let dialog: HTMLDialogElement
const kinds = {
  premises: 'Premises',
  building: 'Building',
  building_part: 'Building part',
}
const icons = {
  premises: 'M3 21V7l6-4 6 4 6-4v14l-6 4-6-4-6 4ZM9 3v14M15 7v14',
  building: 'M4 21V3h12v18M16 9h4v12M2 21h20M8 7h1m2 0h1M8 11h1m2 0h1M8 15h1m2 0h1',
  building_part: 'm12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5',
}

function options(values: (RecorderOption | null)[]): RecorderOption[] {
  return Array.from(
    new Map(values.flatMap(item => (item ? [[item.id, item] as const] : []))).values(),
  ).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}
let premisesOptions = $derived(
  options(places.map(p => (p.kind === 'premises' ? p : p.premises))),
)
let withinPremises = $derived(
  places.filter(p => !premises || p.premises?.id === premises),
)
let buildingOptions = $derived(
  options(withinPremises.map(p => (p.kind === 'building' ? p : p.building))),
)
let partOptions = $derived(
  withinPremises.filter(
    p => p.kind === 'building_part' && (!building || p.building?.id === building),
  ),
)
let matches = $derived(
  places.filter(p =>
    [p.name, kinds[p.kind], p.premises?.name, p.building?.name].some(text =>
      text?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ),
  ),
)

function choosePlace(p: RecorderLocation): void {
  pin = null
  premises = p.kind === 'premises' ? p.id : (p.premises?.id ?? '')
  building = p.kind === 'building' ? p.id : (p.building?.id ?? '')
  part = p.kind === 'building_part' ? p.id : ''
}
function chooseBuilding(id: string): void {
  pin = null
  const place =
    places.find(p => p.id === id) ?? withinPremises.find(p => p.building?.id === id)
  if (place) premises = place.premises?.id ?? ''
  building = id
  part = ''
}

async function load(): Promise<void> {
  const current = ++request
  const selected = session
  const view = screen
  failure = ''
  loading = true
  try {
    if (!selected || view === 'sessions') {
      const query = recorderSessions()
      await query.refresh()
      const rows = await query
      if (current === request) sessions = rows
    } else if (view === 'session') {
      const query = recorderLocations(selected.id)
      await query.refresh()
      const rows = await query
      if (current === request) places = rows
    } else {
      const query = recorderRecords(selected.id)
      await query.refresh()
      const rows = await query
      if (current === request) records = rows
    }
  } catch {
    if (current === request)
      failure =
        'Could not load ' +
        (view === 'session' ? 'locations' : view) +
        '. Check your connection and session access.'
  } finally {
    if (current === request) loading = false
  }
}
// Shallow history gives the Android WebView one back entry per screen, including the location picker.
$effect(() => {
  const next = route
  untrack(() => {
    const target = next?.sessionId
      ? sessions.find(item => item.id === next.sessionId)
      : undefined
    if (!target) {
      screen = 'sessions'
      session = null
      notice = ''
      if (next && !sessions.length) replaceState('', {})
      void load()
      return
    }
    if (session?.id !== target.id) {
      session = target
      layerId =
        target.layers.find(row => row.id === target.defaultLayerId)?.id ??
        (target.layers.length === 1 ? target.layers[0].id : '')
      places = []
      premises = building = part = notice = ''
      realm = 'interior'
      pin = null
    }
    const nextScreen =
      next?.view === 'records' || next?.view === 'recordMap' ? 'records' : 'session'
    const reload = screen !== nextScreen || (next?.view === 'session' && !places.length)
    screen = nextScreen
    if (reload) void load()
  })
})
$effect(() => {
  if (route?.view === 'search' && !dialog.open) dialog.showModal()
  else if (route?.view !== 'search' && dialog.open) dialog.close()
})
function openSession(id: string): void {
  if (saving || session?.id === id) return
  const next = { recorder: { sessionId: id, view: 'session' as const } }
  if (screen === 'sessions') pushState('', next)
  else replaceState('', next)
}
function navigate(
  view: 'map' | 'search' | 'records' | 'recordMap',
  recordId?: string,
): void {
  if (session) pushState('', { recorder: { view, sessionId: session.id, recordId } })
}
function back(): void {
  history.back()
}
function seeRecords(): void {
  navigate('records')
}
function changeRealm(value: SpatialRealm): void {
  if (realm !== value) pin = null
  realm = value
}
function useMapPlace(id: string, point: RecorderPin | null): void {
  const place = places.find(row => row.id === id)
  if (place) choosePlace(place)
  else if (places.some(row => row.building?.id === id)) chooseBuilding(id)
  else {
    premises = id
    building = part = ''
  }
  pin = point
  back()
}
async function capture(): Promise<void> {
  if (!session || session.completed || session.captureIssue || !layerId || saving)
    return
  saving = true
  notice = ''
  const sessionId = session.id
  const placement = { spatialRealm: realm, locationId: selectedId || null, pin }
  if (
    pendingRecord?.sessionId !== sessionId ||
    pendingRecord.layerId !== layerId ||
    JSON.stringify(pendingRecord.placement) !== JSON.stringify(placement)
  )
    pendingRecord = { sessionId, id: crypto.randomUUID(), layerId, placement }
  try {
    await recordFeature(pendingRecord)
    pendingRecord = null
    if (route?.view === 'session' && session?.id === sessionId) {
      notice = 'Record saved.'
      seeRecords()
    }
  } catch (error) {
    const message = (error as { body?: { message?: string } })?.body?.message
    notice = message || 'Could not confirm the record. Tap Record to retry.'
  } finally {
    saving = false
  }
}
</script>

{#if screen === 'sessions' || screen === 'records' || route?.view === 'map'}
  <header class="flex items-center justify-between gap-3">
    {#if screen === 'sessions'}
      <h1 class="text-3xl font-semibold">Sessions</h1>
      <button
        type="button"
        disabled={busy}
        class="min-h-12 px-3 text-sm text-slate-300"
        onclick={signOut}
      >
        Sign out
      </button>
    {:else}
      <button
        type="button"
        disabled={saving}
        class="min-h-12 text-slate-300"
        onclick={back}
      >
        ‹ {route?.view === 'recordMap' ? 'Records' : 'Session'}
      </button>
    {/if}
  </header>
{/if}
{#if message}
  <p role="status">{message}</p>
{/if}
{#if session && (route?.view === 'map' || (route?.view === 'recordMap' && recordOnMap))}
  <h1 class="text-2xl font-semibold">{recordOnMap?.title ?? 'Location map'}</h1>
  <SessionMap
    {places}
    {selectedId}
    {realm}
    {pin}
    onrealm={changeRealm}
    onuse={useMapPlace}
    record={route.view === 'recordMap' ? recordOnMap : undefined}
  />
{:else}
  {#if screen === 'session' && session}
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
      <Selector
        label="Session"
        options={sessions}
        value={session.id}
        onchange={openSession}
        disabled={saving}
      />
      <button
        aria-label="Search session locations"
        type="button"
        disabled={loading || !places.length || saving}
        class="grid w-12 place-items-center rounded-2xl border border-slate-700 disabled:opacity-40"
        onclick={() => {
          search = ''
          navigate('search')
        }}
      >
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 6 6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Open location map"
        disabled={loading || !places.length || saving}
        class="grid w-12 place-items-center rounded-2xl border border-slate-700 disabled:opacity-40"
        onclick={() => navigate('map')}
      >
        <svg
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        >
          <path d={icons.premises} />
        </svg>
      </button>
    </div>
  {:else if screen === 'records' && session}
    <h1 class="text-3xl font-semibold">Records</h1>
    <p class="text-slate-300">{session.name}</p>
  {/if}
  {#if loading}
    <div
      class="grid gap-2"
      role="status"
      aria-label="Loading {screen}"
      aria-busy="true"
    >
      {#each [1, 2, 3] as n (n)}
        <div class="h-16 animate-pulse rounded-2xl bg-slate-900"></div>
      {/each}
    </div>
  {:else if failure}
    <p role="alert">{failure}</p>
    <button
      type="button"
      class="min-h-12 rounded-xl border border-slate-700"
      onclick={load}
    >
      Retry
    </button>
  {:else if screen === 'sessions'}
    <ul class="grid gap-2">
      {#each sessions as item (item.id)}
        <li>
          <button
            type="button"
            class="flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-left font-semibold"
            onclick={() => openSession(item.id)}
          >
            <span class="min-w-0 break-words">{item.name}</span
            ><span aria-hidden="true">›</span>
          </button>
        </li>
      {:else}
        <li class="text-slate-300">No sessions available.</li>
      {/each}
    </ul>
  {:else if screen === 'records'}
    <ol class="grid gap-2">
      {#each records.toReversed() as row, i (row.id)}
        <li class="rounded-2xl bg-slate-900 px-4 py-3">
          <strong>{row.title || `Record ${records.length - i}`}</strong
          ><small class="block break-all text-slate-400">{row.id}</small>
          {#if row.spatialRealm}
            <span class="block text-sm text-slate-300 capitalize"
              >{row.spatialRealm}</span
            >
          {/if}
          {#if row.pin}
            <button
              type="button"
              class="min-h-11 text-cyan-300"
              onclick={() => navigate('recordMap', row.id)}
            >
              View on map
            </button>
          {/if}
        </li>
      {:else}
        <li class="text-slate-300">No records yet.</li>
      {/each}
    </ol>
  {:else}
    {#if premisesOptions.length}
      <Selector
        label="Premises"
        options={premisesOptions}
        value={premises}
        disabled={saving}
        onchange={id => {
          premises = id
          pin = null
          building = part = ''
        }}
      />
    {/if}
    {#if buildingOptions.length}
      <Selector
        label="Building"
        options={buildingOptions}
        value={building}
        disabled={saving}
        onchange={chooseBuilding}
      />
    {/if}
    {#if partOptions.length}
      <Selector
        label="Building part"
        options={partOptions}
        value={part}
        disabled={saving}
        onchange={id => {
          const p = places.find(row => row.id === id)
          if (p) choosePlace(p)
        }}
      />
    {/if}
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}
  {#if screen === 'session' && session}
    <RealmSelector value={realm} onchange={changeRealm} disabled={saving} />
    {#if pin}
      <p class="text-sm text-slate-300">Map pin selected.</p>
    {/if}
    {#if session.captureIssue}
      <p role="status">{session.captureIssue}</p>
    {:else if session.layers.length > 1}
      <Selector
        label="Recording layer"
        options={session.layers}
        value={layerId}
        onchange={id => (layerId = id)}
        disabled={saving}
      />
    {/if}
    <footer class="sticky bottom-0 mt-auto flex items-center gap-3 bg-[#08090e] py-4">
      <button
        type="button"
        disabled={saving ||
          session.completed ||
          !!session.captureIssue ||
          !layerId ||
          !!failure ||
          loading}
        class="min-h-14 flex-1 rounded-2xl bg-white font-semibold text-black disabled:opacity-40"
        onclick={capture}
      >
        Record
      </button>
      <button
        type="button"
        disabled={saving}
        class="min-h-12 rounded-xl border border-slate-700 px-4 text-sm"
        onclick={seeRecords}
      >
        See Records
      </button>
    </footer>
    {#if session.completed}
      <p class="text-slate-400">Session completed.</p>
    {/if}
  {/if}
{/if}

<dialog
  oncancel={event => {
    event.preventDefault()
    back()
  }}
  bind:this={dialog}
  aria-label="Session locations"
  class="m-auto max-h-[80dvh] w-[min(92vw,30rem)] rounded-2xl border border-slate-700 bg-slate-950 p-4 text-white backdrop:bg-black/70"
>
  <div class="sticky top-0 grid gap-3 bg-slate-950 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">Session locations</h2>
      <button type="button" class="min-h-11 px-3" onclick={back}>Close</button>
    </div>
    <input
      type="search"
      aria-label="Filter locations"
      placeholder="Filter locations"
      bind:value={search}
      class="min-h-12 rounded-xl border border-slate-700 bg-slate-900 px-3"
    >
  </div>
  {#each matches as p (p.id)}
    <button
      type="button"
      class="flex min-h-14 w-full items-center gap-3 border-b border-slate-800 py-2 text-left"
      onclick={() => {
        choosePlace(p)
        back()
      }}
    >
      <svg
        aria-hidden="true"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        class="shrink-0"
      >
        <path d={p.iconPath ?? icons[p.kind]} />
      </svg>
      <span class="min-w-0 break-words"
        >{p.name}<small class="block text-slate-400"
          >{[kinds[p.kind], p.building?.name, p.premises?.name]
            .filter(Boolean)
            .join(' · ')}</small
        ></span
      >
    </button>
  {:else}
    <p class="py-4 text-slate-400">No matching locations.</p>
  {/each}
</dialog>
