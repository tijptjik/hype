<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { pushState, replaceState } from '$app/navigation'
import { page } from '$app/state'
// I18N
import { t, errorMessage } from './i18n'
// COMPONENTS
import Selector from './Selector.svelte'
import RecordEditor from './RecordEditor.svelte'
import BottomMenu from './BottomMenu.svelte'
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
  message,
  account = null,
  onSignOut,
}: {
  message: string
  account?: { name: string | null; image?: string | null; email?: string | null } | null
  onSignOut?: () => Promise<void>
} = $props()
let editorDirty = $state(false)
const drafts = new Map<
  string,
  {
    record: import('../../../../src/lib/fieldResearch/recorderEditor').RecorderEditor
    saved: string
  }
>()
async function signOut(): Promise<void> {
  if (
    (editorDirty || drafts.size > 0) &&
    !window.confirm(t('discard_unsaved_record_changes_and_sign_out'))
  )
    return
  await onSignOut?.()
}
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
  premises: t('premises'),
  building: t('building'),
  building_part: t('building_part'),
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
      failure = t(
        view === 'session'
          ? 'load_failed_locations'
          : view === 'sessions'
            ? 'load_failed_sessions'
            : 'load_failed_records',
      )
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
  window.scrollTo({ top: 0, behavior: 'instant' })
  const next = { recorder: { sessionId: id, view: 'session' as const } }
  if (screen === 'sessions') pushState('', next)
  else replaceState('', next)
}
function navigate(
  view: 'map' | 'search' | 'records' | 'recordMap' | 'edit',
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
    const recordId = await recordFeature(pendingRecord)
    pendingRecord = null
    if (route?.view === 'session' && session?.id === sessionId) {
      navigate('edit', recordId)
    }
  } catch (error) {
    notice = errorMessage(error, 'could_not_confirm_the_record_tap_record_to_retry')
  } finally {
    saving = false
  }
}
</script>

{#if screen === 'sessions' || screen === 'records' || route?.view === 'map'}
  <header class="flex items-center justify-between gap-3">
    {#if screen === 'sessions'}
      <h1 class="text-3xl font-semibold">{t('sessions')}</h1>
    {:else}
      <button
        type="button"
        disabled={saving}
        class="text-muted min-h-12"
        onclick={back}
      >
        ‹ {route?.view === 'recordMap' ? t('records') : t('session')}
      </button>
    {/if}
  </header>
{/if}
{#if message}
  <p role="status">{message}</p>
{/if}
{#if session && route?.view === 'edit' && route.recordId}
  {#key route.recordId}
    <RecordEditor
      id={route.recordId}
      draft={drafts.get(route.recordId)}
      onleave={(id, draft) => {
        if (draft) drafts.set(id, draft)
        else drafts.delete(id)
      }}
      ondirty={value => (editorDirty = value)}
    />
  {/key}
{:else if session &&
  (route?.view === 'map' || (route?.view === 'recordMap' && recordOnMap))}
  <h1 class="text-2xl font-semibold">{recordOnMap?.title ?? t('location_map')}</h1>
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
        label={t('session')}
        options={sessions}
        value={session.id}
        onchange={openSession}
        disabled={saving}
      />
      <button
        aria-label={t('search_session_locations')}
        type="button"
        disabled={loading || !places.length || saving}
        class="border-line grid w-12 place-items-center rounded-2xl border disabled:opacity-40"
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
        aria-label={t('open_location_map')}
        disabled={loading || !places.length || saving}
        class="border-line grid w-12 place-items-center rounded-2xl border disabled:opacity-40"
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
    <h1 class="text-3xl font-semibold">{t('records')}</h1>
    <p class="text-muted">{session.name}</p>
  {/if}
  {#if loading}
    <div
      class={screen === 'session'
        ? 'grid min-h-[16.5rem] content-start gap-3'
        : 'grid gap-2'}
      role="status"
      aria-label={t(
        screen === 'sessions'
          ? 'loading_sessions'
          : screen === 'session'
            ? 'loading_session'
            : 'loading_records',
      )}
      aria-busy="true"
    >
      {#each [1, 2, 3] as n (n)}
        <div
          class={[
            'bg-panel grid content-center gap-2 rounded-2xl px-4 py-3',
            screen === 'session'
              ? 'border-line min-h-20 border'
              : screen === 'records'
                ? 'min-h-24'
                : 'min-h-16',
          ]}
        >
          {#if screen === 'session'}
            <div class="bg-surface h-3 w-20 animate-pulse rounded"></div>
          {/if}
          <div class="bg-surface h-5 w-2/3 animate-pulse rounded"></div>
          {#if screen === 'records'}
            <div class="bg-surface h-3 w-4/5 animate-pulse rounded"></div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if failure}
    <p role="alert">{failure}</p>
    <button type="button" class="border-line min-h-12 rounded-xl border" onclick={load}>
      {t('retry')}
    </button>
  {:else if screen === 'sessions'}
    <ul class="grid gap-2">
      {#each sessions as item (item.id)}
        <li>
          <button
            type="button"
            class="bg-panel flex min-h-16 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left font-semibold"
            onclick={() => openSession(item.id)}
          >
            <span class="min-w-0 break-words">{item.name}</span
            ><span aria-hidden="true">›</span>
          </button>
        </li>
      {:else}
        <li class="text-muted">{t('no_sessions_available')}</li>
      {/each}
    </ul>
  {:else if screen === 'records'}
    <ol class="grid gap-2">
      {#each records.toReversed() as row, i (row.id)}
        <li class="bg-panel rounded-2xl px-4 py-3">
          <button
            type="button"
            class="min-h-12 text-left font-semibold"
            onclick={() => navigate('edit', row.id)}
          >
            {row.title || t('record_number', { number: records.length - i })}
          </button><small class="text-muted block break-all">{row.id}</small>
          {#if row.spatialRealm}
            <span class="text-muted block text-sm capitalize"
              >{t(row.spatialRealm)}</span
            >
          {/if}
          {#if row.pin}
            <button
              type="button"
              class="text-accent min-h-11"
              onclick={() => navigate('recordMap', row.id)}
            >
              {t('view_on_map')}
            </button>
          {/if}
        </li>
      {:else}
        <li class="text-muted">{t('no_records_yet')}</li>
      {/each}
    </ol>
  {:else}
    <div class="grid min-h-[16.5rem] content-start gap-3">
      {#if premisesOptions.length}
        <Selector
          label={t('premises')}
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
          label={t('building')}
          options={buildingOptions}
          value={building}
          disabled={saving}
          onchange={chooseBuilding}
        />
      {/if}
      {#if partOptions.length}
        <Selector
          label={t('building_part')}
          options={partOptions}
          value={part}
          disabled={saving}
          onchange={id => {
            const p = places.find(row => row.id === id)
            if (p) choosePlace(p)
          }}
        />
      {/if}
    </div>
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}
  {#if screen === 'session' && session}
    <RealmSelector value={realm} onchange={changeRealm} disabled={saving} />
    {#if pin}
      <p class="text-muted text-sm">{t('map_pin_selected')}</p>
    {/if}
    {#if session.captureIssue}
      <p role="status">
        {errorMessage(
          session.captureIssue,
          'configure_the_session_and_a_recording_layer_in_field_sessions',
        )}
      </p>
    {:else if session.layers.length > 1}
      <Selector
        label={t('recording_layer')}
        options={session.layers}
        value={layerId}
        onchange={id => (layerId = id)}
        disabled={saving}
      />
    {/if}
    <footer
      class="bg-canvas sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] mt-auto flex items-center gap-3 py-4"
    >
      <button
        type="button"
        disabled={saving ||
          session.completed ||
          !!session.captureIssue ||
          !layerId ||
          !!failure ||
          loading}
        class="bg-accent text-on-accent min-h-14 flex-1 rounded-2xl font-semibold disabled:opacity-40"
        onclick={capture}
      >
        {t('record')}
      </button>
      <button
        type="button"
        disabled={saving}
        class="border-line min-h-12 rounded-xl border px-4 text-sm"
        onclick={seeRecords}
      >
        {t('see_records')}
      </button>
    </footer>
    {#if session.completed}
      <p class="text-muted">{t('session_completed')}</p>
    {/if}
  {/if}
{/if}

<dialog
  oncancel={event => {
    event.preventDefault()
    back()
  }}
  bind:this={dialog}
  aria-label={t('session_locations')}
  class="border-line bg-canvas text-ink m-auto max-h-[80dvh] w-[min(92vw,30rem)] rounded-2xl border p-4 backdrop:bg-black/70"
>
  <div class="bg-canvas sticky top-0 grid gap-3 pb-3">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold">{t('session_locations')}</h2>
      <button type="button" class="min-h-11 px-3" onclick={back}>{t('close')}</button>
    </div>
    <input
      type="search"
      aria-label={t('filter_locations')}
      placeholder={t('filter_locations')}
      bind:value={search}
      class="border-line bg-panel min-h-12 rounded-xl border px-3"
    >
  </div>
  {#each matches as p (p.id)}
    <button
      type="button"
      class="border-line flex min-h-14 w-full items-center gap-3 border-b py-2 text-left"
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
        >{p.name}<small class="text-muted block"
          >{[kinds[p.kind], p.building?.name, p.premises?.name]
            .filter(Boolean)
            .join(' · ')}</small
        ></span
      >
    </button>
  {:else}
    <p class="text-muted py-4">{t('no_matching_locations')}</p>
  {/each}
</dialog>

<BottomMenu
  view={route?.view ?? screen}
  {account}
  onSignOut={onSignOut ? signOut : undefined}
/>
