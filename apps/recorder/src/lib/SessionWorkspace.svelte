<script lang="ts">
// SVELTE
import { onDestroy, untrack } from 'svelte'
import { pushState, replaceState } from '$app/navigation'
import { page } from '$app/state'
// I18N
import { t, errorMessage } from './i18n'
// COMPONENTS
import Selector from './Selector.svelte'
import { selectorIcons as icons } from './selectorIcons'
import RecordEditor from './RecordEditor.svelte'
import RecordIdentity from './RecordIdentity.svelte'
import RecordIndex from './RecordIndex.svelte'
import { recorderLocationAddresses } from '../../../../src/lib/fieldResearch/recorder'
import BottomMenu from './BottomMenu.svelte'
import { facilitySymbol } from '../../../../src/lib/indoor/facilities'
import { fly } from 'svelte/transition'
import SessionMap from './SessionMap.svelte'
// API
import {
  recordFeature,
  recorderLocations,
  recorderRecords,
  recorderSessions,
} from './api/recorderSessions.remote'
// TYPES
import type { IndexView } from './recordGroups'
import type { RecordDraft } from './recordDraft'
import type {
  RecorderLocation,
  RecorderRecord,
  RecorderPin,
  RecorderPlacement,
  SpatialRealm,
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
const drafts = new Map<string, RecordDraft>()
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
let indexView = $state<IndexView>({ mode: 'all', oldestFirst: false, collapsed: [] })
let screen = $state<'sessions' | 'session' | 'records'>('sessions')
let route = $derived(page.state.recorder)
let realm = $state<SpatialRealm | null>(null)
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
let selectedId = $state('')
let interruptDialog: HTMLDialogElement
let activeVisit = ''
let lastView = ''
let assignedPlace = $derived(places.find(row => row.id === selectedId))
let selectedPlace = $derived(
  assignedPlace ??
    places
      .flatMap(row => [row.building, row.premises])
      .find(row => row?.id === selectedId),
)
let placeIcon = $derived(
  assignedPlace?.kind === 'building_part' && assignedPlace.iconPath
    ? assignedPlace.iconPath
    : pin?.realm === 'interior' && pin.unitCategory
      ? facilitySymbol(pin.unitCategory, pin.unitLabel).path
      : (assignedPlace?.iconPath ?? icons[selectedPlace?.kind ?? 'location']),
)
let title = $derived(
  (pin?.realm === 'interior' && pin.unitAddress) ||
    selectedPlace?.address ||
    assignedPlace?.building?.address ||
    assignedPlace?.premises?.address ||
    selectedPlace?.name ||
    t('choose_location'),
)
let detail = $derived(
  pin?.realm === 'exterior' && 'surface' in pin
    ? [pin.floorLabel, pin.direction + ' facade'].filter(Boolean).join(' · ')
    : pin?.realm === 'interior' && pin.unitLabel
      ? pin.unitLabel
      : selectedPlace?.name,
)

let addressById = $derived(recorderLocationAddresses(places))

function recordAddress(row: Pick<RecorderRecord, 'locationId' | 'pin'>): string {
  return (
    (row.pin?.realm === 'interior' && row.pin.unitAddress) ||
    addressById.get(row.locationId ?? '') ||
    t('no_record_address')
  )
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
    } else {
      const locationsQuery = recorderLocations(selected.id)
      const recordsQuery = recorderRecords(selected.id)
      await Promise.all([locationsQuery.refresh(), recordsQuery.refresh()])
      const [locations, captures] = await Promise.all([locationsQuery, recordsQuery])
      if (current === request) {
        places = locations
        records = captures
      }
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
    const target =
      next?.sessionId && next.visit === activeVisit
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
      indexView = { mode: 'all', oldestFirst: false, collapsed: [] }
      places = []
      selectedId = notice = ''
      records = []
      realm = null
      pin = null
    }
    const nextScreen =
      next?.view === 'records' || next?.view === 'recordMap' ? 'records' : 'session'
    const reload =
      screen !== nextScreen ||
      (next?.view === 'session' &&
        (!places.length || lastView === 'edit' || lastView === 'recordMap'))
    lastView = next?.view ?? ''
    screen = nextScreen
    if (reload) void load()
  })
})
function openSession(id: string): void {
  if (saving) return
  activeVisit = crypto.randomUUID()
  window.scrollTo({ top: 0, behavior: 'instant' })
  pushState('', { recorder: { sessionId: id, view: 'session', visit: activeVisit } })
}
function navigate(view: 'map' | 'recordMap' | 'edit', recordId?: string): void {
  if (session)
    pushState('', {
      recorder: { view, sessionId: session.id, visit: activeVisit, recordId },
    })
}
function back(): void {
  history.back()
}
function interrupt(): void {
  interruptDialog.close()
  activeVisit = ''
  pendingRecord = null
  replaceState('', {})
}
async function capture(placement: RecorderPlacement): Promise<void> {
  if (!session || session.completed || session.captureIssue || !layerId || saving)
    return
  saving = true
  notice = ''
  const sessionId = session.id
  const origin = route?.view
  const visit = activeVisit
  if (
    pendingRecord?.sessionId !== sessionId ||
    pendingRecord.layerId !== layerId ||
    JSON.stringify(pendingRecord.placement) !== JSON.stringify(placement)
  )
    pendingRecord = { sessionId, id: crypto.randomUUID(), layerId, placement }
  try {
    const recordId = await recordFeature(pendingRecord)
    pendingRecord = null
    if (route?.view === origin && session?.id === sessionId && activeVisit === visit) {
      selectedId = placement.locationId ?? ''
      realm = placement.spatialRealm
      pin = placement.pin
      // Show the capture's placement immediately while its saved identifier loads.
      records = [
        ...records,
        {
          ...placement,
          id: recordId,
          featureId: null,
          title: null,
          identifierTags: [],
          thumbnailRevision: null,
        },
      ]
      // Replace the accepted picker so Back and Save both lead to the session index.
      const enter = origin === 'map' ? replaceState : pushState
      enter('', {
        recorder: { view: 'edit', sessionId, visit, recordId, newRecord: true },
      })
      window.scrollTo({ top: 0, behavior: 'instant' })
      void load()
    }
  } catch (error) {
    notice = errorMessage(
      error,
      origin === 'map'
        ? 'could_not_confirm_location'
        : 'could_not_confirm_the_record_tap_record_to_retry',
    )
  } finally {
    saving = false
  }
}
</script>

{#if session}
  <header
    class="bg-canvas border-line sticky top-0 z-10 flex items-center justify-between gap-3 border-b pt-[max(0.5rem,env(safe-area-inset-top))] pb-2"
  >
    {#if route?.view === 'edit'}
      <button
        type="button"
        class="min-h-11 px-2"
        aria-label={t('records')}
        onclick={back}
      >
        ‹
      </button>
    {/if}
    <h1 class="min-w-0 flex-1 text-xl leading-tight font-semibold break-words">
      {session.name}
    </h1>
    <button
      type="button"
      disabled={saving}
      aria-label={t('interrupt_session')}
      class="bg-panel grid size-11 shrink-0 place-items-center rounded-full text-xl"
      onclick={() => {
        interruptDialog.showModal()
        interruptDialog.querySelectorAll('button')[1]?.focus()
      }}
    >
      ×
    </button>
  </header>
{:else}
  <h1 class="text-3xl font-semibold">{t('sessions')}</h1>
{/if}
{#if message}
  <p role="status">{message}</p>
{/if}
{#if session && route?.view === 'edit' && route.recordId}
  {#key route.recordId}
    <RecordEditor
      id={route.recordId}
      newRecord={route.newRecord}
      onsaved={id => {
        if (route?.view === 'edit' && route.recordId === id) {
          notice = t('changes_saved')
          back()
        }
      }}
      draft={drafts.get(route.recordId)}
      onleave={(id, draft) => {
        if (draft) drafts.set(id, draft)
        else drafts.delete(id)
      }}
      ondirty={value => (editorDirty = value)}
    >
      {#snippet identity(title)}
        <RecordIdentity
          heading
          address={recordOnMap ? recordAddress(recordOnMap) : t('no_record_address')}
          tags={recordOnMap?.identifierTags ?? []}
          {title}
          realm={recordOnMap?.spatialRealm}
        />
      {/snippet}
    </RecordEditor>
  {/key}
{:else if session &&
  (route?.view === 'map' || (route?.view === 'recordMap' && recordOnMap))}
  <section
    aria-label={t('location')}
    class="bg-canvas flex min-h-0 flex-1 flex-col gap-3"
    in:fly={{ y: 56, duration: 190 }}
  >
    {#if route.view === 'map' &&
      !session.completed &&
      !session.captureIssue &&
      session.layers.length > 1}
      <Selector
        label={t('recording_layer')}
        icon="layer"
        options={session.layers}
        value={layerId}
        onchange={id => (layerId = id)}
        disabled={saving}
      />
    {/if}
    {#if notice && route.view === 'map'}
      <p role="status">{notice}</p>
    {/if}
    <SessionMap
      {places}
      {selectedId}
      {realm}
      {pin}
      {saving}
      canCapture={!session.completed && !session.captureIssue && !!layerId}
      onuse={(locationId, spatialRealm, pin) =>
        capture({ locationId, spatialRealm, pin })}
      oncancel={back}
      record={route.view === 'recordMap' ? recordOnMap : undefined}
    />
  </section>
{:else}
  {#if loading}
    <div
      class="grid content-start gap-2"
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
      {#if session}
        <div class="flex min-h-12 items-center justify-between">
          <div class="bg-surface h-6 w-24 animate-pulse rounded"></div>
          <div class="bg-panel size-12 animate-pulse rounded-full"></div>
        </div>
      {/if}
      {#each [1, 2, 3] as n (n)}
        <div
          class={[
            'bg-panel grid content-center gap-2 rounded-2xl px-4 py-3',
            session ? 'min-h-24' : 'min-h-16',
          ]}
        >
          <div class="bg-surface h-5 w-2/3 animate-pulse rounded"></div>
          {#if session}
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
  {:else if session}
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-xl font-semibold">{t('records')}</h2>
      <button
        type="button"
        aria-label={t('record')}
        disabled={saving || session.completed || !!session.captureIssue || !layerId}
        class="bg-accent text-on-accent grid size-12 place-items-center rounded-full text-2xl disabled:opacity-40"
        onclick={() =>
          capture({ spatialRealm: realm, locationId: selectedId || null, pin })}
      >
        +
      </button>
    </div>
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
        icon="layer"
        options={session.layers}
        value={layerId}
        onchange={id => (layerId = id)}
        disabled={saving}
      />
    {/if}
    <RecordIndex
      {records}
      {places}
      {recordAddress}
      bind:view={indexView}
      onedit={id => navigate('edit', id)}
      onmap={id => navigate('recordMap', id)}
    />
  {/if}
  {#if notice}
    <p role="status">{notice}</p>
  {/if}
  {#if session}
    {#if session.completed}
      <p class="text-muted">{t('session_completed')}</p>
    {/if}
    <footer
      class="bg-canvas sticky bottom-0 mt-auto pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <button
        type="button"
        aria-label={t('location')}
        disabled={saving || loading || !!failure}
        onclick={() => {
          notice = ''
          navigate('map')
        }}
        class="border-line bg-panel grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-4 py-3 text-left"
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
          <path d={placeIcon} />
        </svg>
        <span
          ><strong class="block break-words">{title}</strong>
          {#if detail && detail !== title}
            <small class="text-muted block">{detail}</small>
          {/if}</span
        >
        <span aria-hidden="true">⌃</span>
      </button>
    </footer>
  {/if}
{/if}
<dialog
  bind:this={interruptDialog}
  aria-labelledby="interrupt-title"
  class="border-line bg-panel text-ink m-auto w-[min(90vw,24rem)] rounded-2xl border p-5 backdrop:bg-black/65"
>
  <h2 id="interrupt-title" class="text-xl font-semibold">{t('interrupt_prompt')}</h2>
  <div class="mt-5 grid grid-cols-2 gap-2">
    <button
      type="button"
      class="border-line min-h-12 rounded-xl border"
      onclick={interrupt}
    >
      {t('yes')}
    </button>
    <button
      type="button"
      class="bg-accent text-on-accent min-h-12 rounded-xl font-semibold"
      onclick={() => interruptDialog.close()}
    >
      {t('continue_session')}
    </button>
  </div>
</dialog>
{#if !session}
  <BottomMenu view="sessions" {account} onSignOut={onSignOut ? signOut : undefined} />
{/if}
