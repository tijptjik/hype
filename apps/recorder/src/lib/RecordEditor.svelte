<script lang="ts">
// SVELTE
import type { Snippet } from 'svelte'
import { onDestroy, untrack } from 'svelte'
import { beforeNavigate } from '$app/navigation'
// I18N
import { t, errorMessage } from './i18n'
// COMPONENTS
import Choice from './Choice.svelte'
import { optionLabel } from './optionLabel'
import OptionIcon from './OptionIcon.svelte'
import { propertyOptionIcon } from '../../../../src/lib/properties/optionIcons'
import RecordPhotos from './RecordPhotos.svelte'
import RecordField from './RecordField.svelte'
import { rangeText } from '../../../../src/lib/properties/range'
// API
import { recorderEditor, saveRecorder } from './api/recorderEditor.remote'
import { uploadRecorderPhoto } from './hype'
// TYPES
import type { PendingPhoto, RecordDraft } from './recordDraft'
import type {
  RecorderEditor,
  RecorderStatus,
} from '../../../../src/lib/fieldResearch/recorderEditor'
let {
  id,
  draft,
  newRecord = false,
  onsaved,
  identity,
  onleave,
  ondirty,
}: {
  id: string
  identity: Snippet<[string]>
  newRecord?: boolean
  onsaved: (id: string) => void
  draft?: RecordDraft
  onleave?: (id: string, draft: RecordDraft | null) => void
  ondirty?: (dirty: boolean) => void
} = $props()
let record = $state<RecorderEditor | null>(null)
let loading = $state(true)
let busy = $state(false)
let failure = $state('')
let saved = $state('')
let statusOpen = $state(false)
let fieldsOpen = $state(true)
let photos = $state<PendingPhoto[]>([])
let progress = $state('')
let request = 0
function snapshot(record: RecorderEditor): string {
  return JSON.stringify({
    title: record.title,
    description: record.description ?? '',
    status: record.status,
    values: record.values,
  })
}
let savedText = $derived(
  saved ? (JSON.parse(saved) as Pick<RecorderEditor, 'title' | 'description'>) : null,
)
let fieldsDirty = $derived(record !== null && snapshot(record) !== saved)
let dirty = $derived(fieldsDirty || photos.length > 0)
let canSave = $derived(newRecord || fieldsDirty || photos.some(photo => photo.selected))
let selectedType = $derived(
  record?.types.find(type => type.id === record?.status.featureType),
)
function typeIcon(type?: { id: string; kind?: string; label: string }): string {
  if (type?.id === 'sign' || type?.label.toLowerCase() === 'sign')
    return 'M4 3v18M4 5h16v9H4m4-6h8m-8 3h5'
  if (type?.kind === 'place')
    return 'M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Zm0-15a3 3 0 1 1 0 6 3 3 0 0 1 0-6'
  return 'm12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9v9M3 8l9 4 9-4'
}
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
    icon: 'M3 14h3l4-3h5a2 2 0 0 1 0 4h-4m5 0 4-3a2 2 0 0 1 2 3l-7 5H9l-4-2H3zM10 3h7v6h-7z',
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
  ondirty?.(dirty || busy)
})
onDestroy(() => {
  onleave?.(
    record?.id ?? id,
    dirty && record
      ? {
          record: structuredClone($state.snapshot(record)),
          saved,
          photos: $state.snapshot(photos),
        }
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
    photos = draft.photos
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
    saved = snapshot(result)
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
  try {
    if (fieldsDirty) {
      record = await saveRecorder({
        id: record.id,
        revisionId: record.revisionId,
        version: record.version,
        modifiedAt: record.modifiedAt,
        ...(record.title !== savedText?.title && { title: record.title }),
        ...(record.description !== savedText?.description && {
          description: record.description,
        }),
        status: record.status,
        values: record.values,
      })
      saved = snapshot(record)
    }
    const selected = photos.filter(photo => photo.selected)
    for (const [index, photo] of selected.entries()) {
      progress = t('uploading_photo', { number: index + 1, total: selected.length })
      record = await uploadRecorderPhoto(id, photo)
      saved = snapshot(record)
      photos = photos.filter(item => item.id !== photo.id)
    }
    onsaved(id)
  } catch (cause) {
    failure = errorMessage(
      cause,
      progress
        ? 'photo_save_failed'
        : 'could_not_save_your_changes_are_still_here_try_again',
    )
  } finally {
    progress = ''
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
    return option ? optionLabel(option) : id
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
  <div class="px-1 py-2">
    {@render identity(savedText?.title ?? record.title)}
  </div>
  {#if !record.editable}
    <p class="text-muted">
      {t('this_record_is_read_only_published_or_linked_features_are_edited_in_hype')}
    </p>
  {/if}
  <form onsubmit={save} class="grid gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <section class="border-line bg-panel rounded-xl border px-3.5 py-3">
      <button
        type="button"
        aria-expanded={statusOpen}
        aria-controls="record-status"
        onclick={() => (statusOpen = !statusOpen)}
        class="grid min-h-11 w-full content-center gap-2 text-left"
      >
        <span class="flex items-center justify-between text-base font-semibold"
          >{t('status')} <span aria-hidden="true">{statusOpen ? '−' : '+'}</span></span
        >
        {#if !statusOpen}
          <span class="flex flex-wrap gap-1.5 text-xs">
            <span
              class="bg-surface inline-flex items-center gap-1 rounded-md px-2 py-1"
            >
              <OptionIcon compact path={typeIcon(selectedType)} />
              {selectedType?.label || record.status.featureType}
            </span>
            {#each booleanFields as field (field.key)}
              <span
                class="bg-surface inline-flex items-center gap-1 rounded-md px-2 py-1"
              >
                <OptionIcon compact path={field.icon} />
                {record.status[field.key] ? field.yes : field.no}
              </span>
            {/each}
          </span>
        {/if}
      </button>
      <div id="record-status" hidden={!statusOpen} class="mt-3 grid gap-4">
        <Choice
          label={t('feature_type')}
          value={record.status.featureType}
          options={record.types.map(type => ({
            value: type.id,
            label: type.label,
            path: typeIcon(type),
          }))}
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
                path: field.icon,
                label: field.key === 'isIntangible' ? t('intangible') : t('yes'),
              },
              {
                value: 'false',
                path: field.icon,
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
    <section class="border-line bg-panel rounded-xl border px-3.5 py-3">
      <button
        type="button"
        aria-expanded={fieldsOpen}
        aria-controls="record-fields"
        onclick={() => (fieldsOpen = !fieldsOpen)}
        class="grid min-h-11 w-full content-center gap-2 text-left"
      >
        <span class="flex items-center justify-between text-base font-semibold"
          >{t('fields')} <span aria-hidden="true">{fieldsOpen ? '−' : '+'}</span></span
        >
        {#if !fieldsOpen}
          <span class="flex flex-wrap gap-1.5 text-xs"
            >{#each record.fields as field (field.id)}
              {@const text = summary(field)}
              {@const value = record.values[field.id]}
              {@const chosen =
                field.values?.filter(option =>
                  Array.isArray(value)
                    ? value.includes(option.id)
                    : value === option.id,
                ) ?? []}
              {#if chosen.length &&
                chosen.every(option => propertyOptionIcon(option.icon))}
                {#each chosen as option (option.id)}
                  <span
                    class="bg-surface inline-flex items-center gap-1.5 rounded-lg px-2 py-1"
                    title={field.i18n?.en?.label || field.key}
                  >
                    <span class="sr-only">{field.i18n?.en?.label || field.key}: </span>
                    <OptionIcon id={option.icon} compact />
                    {optionLabel(option)}
                  </span>
                {/each}
              {:else if text}
                <span class="bg-surface rounded-lg px-2 py-1 break-words"
                  >{field.i18n?.en?.label || field.key}: {text}</span
                >
              {/if}
            {/each}</span
          >
        {/if}
      </button>
      <div
        id="record-fields"
        hidden={!fieldsOpen}
        class="divide-line mt-2 grid divide-y"
      >
        {#each record.fields as field (field.id)}
          <div class="min-w-0 py-4 first:pt-1 last:pb-1">
            <RecordField
              {field}
              value={record.values[field.id] ?? null}
              disabled={busy || !record.editable}
              onchange={value => {
                if (record) record.values[field.id] = value
              }}
            />
          </div>
        {:else}
          <p class="text-muted">
            {t('no_fields_are_configured_for_this_recording_layer')}
          </p>
        {/each}
      </div>
    </section>
    <RecordPhotos
      bind:photos
      revisions={record.photoRevisions ?? []}
      editable={record.editable}
      {busy}
    />
    <section
      aria-labelledby="record-details"
      class="border-line bg-panel grid gap-3 rounded-xl border px-3.5 py-3"
    >
      <h2 id="record-details" class="text-base font-semibold">{t('details')}</h2>
      <label class="grid gap-1 text-sm font-medium">
        {t('record_title')}
        <input
          bind:value={record.title}
          maxlength="128"
          disabled={busy || !record.editable}
          class="bg-surface border-line min-h-11 min-w-0 rounded-lg border px-3 text-base font-normal"
        >
      </label>
      <label class="grid gap-1 text-sm font-medium">
        {t('description')}
        <textarea
          bind:value={record.description}
          rows="3"
          maxlength="8192"
          disabled={busy || !record.editable}
          class="bg-surface border-line min-w-0 rounded-lg border px-3 py-2 text-base font-normal"
        ></textarea>
      </label>
    </section>
    {#if progress}
      <p role="status">{progress}</p>
    {/if}
    {#if record.editable}
      <button
        type="submit"
        disabled={busy || !canSave}
        aria-busy={busy}
        class="bg-accent text-on-accent flex min-h-14 items-center justify-center gap-2 rounded-xl px-4 font-semibold disabled:opacity-50"
      >
        {t('save_changes')}
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
