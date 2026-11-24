<script lang="ts">
// SVELTE
import { onDestroy, onMount, untrack } from 'svelte'
import { scale } from 'svelte/transition'
import { beforeNavigate } from '$app/navigation'
// I18N
import { t, errorMessage } from './i18n'
// COMPONENTS
import Choice from './Choice.svelte'
import RecordField from './RecordField.svelte'
import { rangeText } from '../../../../src/lib/properties/range'
// API
import { recorderEditor, saveRecorder } from './api/recorderEditor.remote'
// TYPES
import type {
  RecorderEditor,
  RecorderStatus,
} from '../../../../src/lib/fieldResearch/recorderEditor'
type Draft = { record: RecorderEditor; saved: string }
let {
  id,
  draft,
  onleave,
  ondirty,
}: {
  id: string
  draft?: Draft
  onleave?: (id: string, draft: Draft | null) => void
  ondirty?: (dirty: boolean) => void
} = $props()
let record = $state<RecorderEditor | null>(null)
let loading = $state(true)
let busy = $state(false)
let failure = $state('')
let saveComplete = $state(false)
let reducedMotion = $state(false)
let saved = $state('')
let statusOpen = $state(false)
let fieldsOpen = $state(true)
let request = 0
onMount(() => {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)')
  const update = () => {
    reducedMotion = media.matches
  }
  update()
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
})
let dirty = $derived(
  record !== null &&
    JSON.stringify({ status: record.status, values: record.values }) !== saved,
)
let selectedType = $derived(
  record?.types.find(type => type.id === record?.status.featureType),
)
const booleanFields: {
  key: Exclude<keyof RecorderStatus, 'featureType'>
  label: string
  yes: string
  no: string
  icon: string
}[] = [
  {
    key: 'isVisitable',
    label: t('visitable'),
    yes: t('visitable'),
    no: t('not_visitable'),
    icon: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  },
  {
    key: 'isIntangible',
    label: t('tangibility'),
    yes: t('intangible'),
    no: t('tangible'),
    icon: 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4',
  },
  {
    key: 'isDraft',
    label: t('draft'),
    yes: t('draft'),
    no: t('not_draft'),
    icon: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-2 2 5 5',
  },
  {
    key: 'isPendingReview',
    label: t('queue_for_review'),
    yes: t('queue_for_review'),
    no: t('not_queued'),
    icon: 'M9 6h12M9 12h12M9 18h12M2 6l2 2 3-4M2 12l2 2 3-4M2 18l2 2 3-4',
  },
]
$effect(() => {
  if (dirty) saveComplete = false
})
$effect(() => {
  ondirty?.(dirty || busy)
})
onDestroy(() => {
  onleave?.(
    record?.id ?? id,
    dirty && record
      ? { record: structuredClone($state.snapshot(record)), saved }
      : null,
  )
  request++
  ondirty?.(false)
})
beforeNavigate(event => {
  if (busy || (dirty && !window.confirm(t('discard_unsaved_record_changes'))))
    event.cancel()
})
$effect(() => {
  const recordId = id
  untrack(() => {
    void load(recordId)
  })
})
async function load(recordId: string): Promise<void> {
  if (draft && !record) {
    record = structuredClone(draft.record)
    saved = draft.saved
    loading = false
    return
  }
  const token = ++request
  loading = true
  failure = ''
  try {
    const query = recorderEditor(recordId)
    await query.refresh()
    const result = await query
    if (token !== request) return
    record = structuredClone(result)
    saved = JSON.stringify({ status: result.status, values: result.values })
  } catch {
    if (token === request)
      failure = t('could_not_open_this_record_check_your_connection_and_session_access')
  } finally {
    if (token === request) loading = false
  }
}
async function save(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  if (!record || busy || !record.editable) return
  busy = true
  failure = ''
  saveComplete = false
  try {
    record = await saveRecorder({
      id: record.id,
      revisionId: record.revisionId,
      version: record.version,
      modifiedAt: record.modifiedAt,
      status: record.status,
      values: record.values,
    })
    saved = JSON.stringify({ status: record.status, values: record.values })
    saveComplete = true
  } catch (cause) {
    failure = errorMessage(
      cause,
      'could_not_save_your_changes_are_still_here_try_again',
    )
  } finally {
    busy = false
  }
}
function summary(field: RecorderEditor['fields'][number]): string {
  const value = record?.values[field.id]
  if (value == null || value === '') return ''
  if (field.dataType === 'boolean') return value ? t('yes') : t('no')
  if (field.component === 'PhoneField') {
    try {
      const phones = JSON.parse(String(value))
      if (Array.isArray(phones)) return phones.join(', ')
    } catch {
      /* Retain legacy phone text. */
    }
  }
  if (field.dataType === 'link') {
    try {
      return JSON.parse(String(value))
        .items.map(
          (item: { label: { en?: string }; url: string }) => item.label.en || item.url,
        )
        .join(', ')
    } catch {
      return ''
    }
  }
  if (field.dataType === 'dateRange' || field.dataType === 'timeRange')
    return rangeText(field, String(value))
  const label = (id: string) => {
    const option = field.values?.find(item => item.id === id)
    return option?.i18n?.en?.value || option?.value || id
  }
  return Array.isArray(value) ? value.map(label).join(', ') : label(String(value))
}
</script>
<svelte:window
  onbeforeunload={event => {
    if (dirty) event.preventDefault()
  }}
/>
{#if loading}
  <div
    role="status"
    aria-label={t('loading_record')}
    aria-busy="true"
    class="grid gap-4"
  >
    <div class="bg-surface h-9 w-2/3 animate-pulse rounded"></div>
    <div class="bg-panel h-36 animate-pulse rounded-2xl"></div>
    <div class="bg-panel h-72 animate-pulse rounded-2xl"></div>
  </div>
{:else if record}
  <h1 class="text-2xl font-semibold break-words">{record.title}</h1>
  {#if !record.editable}
    <p class="text-muted">
      {t('this_record_is_read_only_published_or_linked_features_are_edited_in_hype')}
    </p>
  {/if}
  <form onsubmit={save} class="grid gap-8">
    <section class="border-line bg-panel rounded-2xl border p-4">
      <button
        type="button"
        aria-expanded={statusOpen}
        aria-controls="record-status"
        onclick={() => (statusOpen = !statusOpen)}
        class="grid min-h-12 w-full gap-3 text-left"
      >
        <span class="flex justify-between text-lg font-semibold"
          >{t('status')} <span aria-hidden="true">{statusOpen ? '−' : '+'}</span></span
        >
        {#if !statusOpen}
          <span class="flex flex-wrap gap-2 text-sm">
            <span class="bg-surface rounded-lg px-2 py-1"
              ><svg
                aria-hidden="true"
                class="mr-1 inline size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
              >
                <path
                  d={selectedType?.kind === 'place'
                    ? 'M12 22s8-8 8-14a8 8 0 0 0-16 0c0 6 8 14 8 14Zm0-17a3 3 0 1 0 0 6 3 3 0 0 0 0-6'
                    : 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4'}
                />
              </svg> {selectedType?.label || record.status.featureType}</span
            >
            {#each booleanFields as field (field.key)}
              <span class="bg-surface rounded-lg px-2 py-1"
                ><svg
                  aria-hidden="true"
                  class="mr-1 inline size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                >
                  <path d={field.icon} />
                </svg>
                {record.status[field.key] ? field.yes : field.no}</span
              >
            {/each}
          </span>
        {/if}
      </button>
      <div id="record-status" hidden={!statusOpen} class="mt-4 grid gap-5">
        <Choice
          label={t('feature_type')}
          value={record.status.featureType}
          options={record.types.map(type => ({ value: type.id, label: type.label }))}
          disabled={busy || !record.editable}
          onchange={value => {
            if (record) record.status.featureType = value
          }}
        />
        {#each booleanFields as field (field.key)}
          <Choice
            label={field.label}
            value={String(record.status[field.key])}
            options={[
              {
                value: 'true',
                label: field.key === 'isIntangible' ? t('intangible') : t('yes'),
              },
              {
                value: 'false',
                label: field.key === 'isIntangible' ? t('tangible') : t('no'),
              },
            ]}
            disabled={busy || !record.editable}
            onchange={value => {
              if (record) record.status[field.key] = value === 'true'
            }}
          />
        {/each}
        <p class="text-muted text-sm">
          {t(
            'draft_marks_unfinished_work_clearing_it_does_not_publish_this_record_queue_for_review_flags_it_for_the_review_queue',
          )}
        </p>
      </div>
    </section>
    <section class="border-line bg-panel rounded-2xl border p-4">
      <button
        type="button"
        aria-expanded={fieldsOpen}
        aria-controls="record-fields"
        onclick={() => (fieldsOpen = !fieldsOpen)}
        class="grid min-h-12 w-full gap-3 text-left"
      >
        <span class="flex justify-between text-lg font-semibold"
          >{t('fields')} <span aria-hidden="true">{fieldsOpen ? '−' : '+'}</span></span
        >
        {#if !fieldsOpen}
          <span class="flex flex-wrap gap-2 text-sm"
            >{#each record.fields as field (field.id)}
              {@const text = summary(field)}
              {#if text}
                <span class="bg-surface rounded-lg px-2 py-1 break-words"
                  >{field.i18n?.en?.label || field.key}: {text}</span
                >
              {/if}
            {/each}</span
          >
        {/if}
      </button>
      <div id="record-fields" hidden={!fieldsOpen} class="mt-4 grid gap-5">
        {#each record.fields as field (field.id)}
          <RecordField
            {field}
            value={record.values[field.id] ?? null}
            disabled={busy || !record.editable}
            onchange={value => {
              if (record) record.values[field.id] = value
            }}
          />
        {:else}
          <p class="text-muted">
            {t('no_fields_are_configured_for_this_recording_layer')}
          </p>
        {/each}
      </div>
    </section>
    {#if record.editable}
      <button
        type="submit"
        disabled={busy || !dirty}
        aria-busy={busy}
        class="bg-accent text-on-accent flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 font-semibold disabled:opacity-50"
      >
        <span class="relative">
          <span
            class="absolute top-1/2 right-full mr-2 -translate-y-1/2"
            aria-hidden="true"
          >
            {#if saveComplete && !dirty}
              <svg
                aria-hidden="true"
                in:scale={{ duration: reducedMotion ? 0 : 220, start: 0.5 }}
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            {/if}
          </span>
          {t('save_changes')}
        </span>
      </button>
    {/if}
  </form>
{/if}
{#if failure}
  <p role="alert" class="text-danger">{failure}</p>
  {#if !record}
    <button
      type="button"
      class="border-line min-h-12 rounded-xl border"
      onclick={() => load(id)}
    >
      {t('try_again')}
    </button>
  {/if}
{/if}
<p role="status" class="sr-only">{saveComplete && !dirty ? t('changes_saved') : ''}</p>
