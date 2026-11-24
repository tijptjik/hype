<script lang="ts">
// I18N
import { t, errorMessage } from './i18n'
// COMPONENTS
import Choice from './Choice.svelte'
// DOMAIN
import {
  formatRangeEndpoint,
  parseRangeEndpoint,
} from '../../../../src/lib/properties/range'
// TYPES
import type {
  RecorderEditor,
  RecorderFieldValue,
} from '../../../../src/lib/fieldResearch/recorderEditor'
let {
  field,
  value,
  onchange,
  disabled = false,
}: {
  field: RecorderEditor['fields'][number]
  value: RecorderFieldValue
  onchange: (value: RecorderFieldValue) => void
  disabled?: boolean
} = $props()
let label = $derived(field.i18n?.en?.label || field.key)
let choice = $derived(
  Boolean(field.values?.length) ||
    (field.type === 'classifier' && field.dataType !== 'boolean'),
)
let range = $derived(field.dataType === 'dateRange' || field.dataType === 'timeRange')
let rangeError = $state('')
let start = $state('')
let end = $state('')
let rangeInput = $state<HTMLInputElement>()
$effect(() => {
  start = endpoints[0]
  end = endpoints[1]
})
let endpoints = $derived.by(() => {
  try {
    const parsed = JSON.parse(String(value))
    return [
      formatRangeEndpoint(field, parsed.start),
      formatRangeEndpoint(field, parsed.end),
    ]
  } catch {
    return ['', '']
  }
})
let links = $derived.by(
  (): { id: string; url: string; label: Record<string, string> }[] => {
    try {
      return JSON.parse(String(value)).items ?? []
    } catch {
      return []
    }
  },
)
function updateLink(index: number, key: 'url' | 'label', text: string): void {
  const rows = structuredClone(links)
  if (key === 'url') rows[index].url = text
  else rows[index].label.en = text
  onchange(JSON.stringify({ version: 1, items: rows }))
}
function updateRange(): void {
  rangeError = ''
  if (!start && !end) {
    rangeInput?.setCustomValidity('')
    onchange(null)
    return
  }
  try {
    const a = parseRangeEndpoint(field, start),
      b = parseRangeEndpoint(field, end)
    if (a > b) throw new Error(t('start_must_not_follow_end'))
    rangeInput?.setCustomValidity('')
    onchange(JSON.stringify({ version: 1, start: a, end: b }))
  } catch (cause) {
    rangeError = errorMessage(cause, 'invalid_range')
    rangeInput?.setCustomValidity(rangeError)
  }
}
let phones = $derived.by((): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(String(value))
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* Retain legacy text numbers. */
  }
  return String(value).split(/\r?\n/)
})
const inputClass =
  'min-h-12 w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink'
</script>
<div class="grid gap-2">
  {#if field.dataType === 'boolean'}
    <Choice
      {disabled}
      {label}
      value={value == null ? '' : String(value)}
      options={[
        { value: 'true', label: t('yes') },
        { value: 'false', label: t('no') },
      ]}
      onchange={v => onchange(v === 'true')}
    />
  {:else if choice && field.cardinality === 'many'}
    <fieldset {disabled}>
      <legend class="text-muted mb-2 text-sm">{label}</legend>
      <div class="grid gap-2">
        {#each field.values ?? [] as option (option.id)}
          <label class="bg-surface flex min-h-12 items-center gap-3 rounded-xl px-3"
            ><input
              type="checkbox"
              checked={Array.isArray(value) && value.includes(option.id)}
              onchange={event =>
                onchange(
                  event.currentTarget.checked
                    ? [...(Array.isArray(value) ? value : []), option.id]
                    : (Array.isArray(value) ? value : []).filter(
                        id => id !== option.id,
                      ),
                )}
            >{option.i18n?.en?.value || option.value}</label
          >
        {/each}
      </div>
    </fieldset>
  {:else if choice}
    <label for={'field-' + field.id} class="text-muted text-sm">{label}</label>
    <select
      id={'field-' + field.id}
      {disabled}
      class={inputClass}
      value={value ?? ''}
      onchange={event => onchange(event.currentTarget.value || null)}
    >
      <option value="">{t('not_set')}</option>
      {#each field.values ?? [] as option (option.id)}
        <option value={option.id}>{option.i18n?.en?.value || option.value}</option>
      {/each}
    </select>
  {:else if range}
    <fieldset {disabled} class="grid gap-2">
      <legend class="text-muted mb-2 text-sm">{label}</legend>
      <div class="grid grid-cols-2 gap-2">
        <label class="grid gap-1 text-sm"
          >{t('from')}<input
            bind:this={rangeInput}
            class={inputClass}
            bind:value={start}
            placeholder={field.dataType === 'timeRange'
              ? t('hh_mm')
              : field.dateResolution === 'day'
                ? t('yyyy_mm_dd')
                : field.dateResolution === 'month'
                  ? t('yyyy_mm')
                  : t('yyyy')}
            onchange={updateRange}
          ></label
        >
        <label class="grid gap-1 text-sm"
          >{t('to')}<input
            class={inputClass}
            bind:value={end}
            placeholder={field.dataType === 'timeRange'
              ? t('hh_mm')
              : field.dateResolution === 'day'
                ? t('yyyy_mm_dd')
                : field.dateResolution === 'month'
                  ? t('yyyy_mm')
                  : t('yyyy')}
            onchange={updateRange}
          ></label
        >
      </div>
      {#if rangeError}
        <p role="alert" class="text-danger">{rangeError}</p>
      {/if}
    </fieldset>
  {:else if field.component === 'PhoneField'}
    <fieldset {disabled} class="grid gap-2">
      <legend class="text-muted mb-2 text-sm">{label}</legend>
      {#each phones as phone, index (index)}
        <div class="flex gap-2">
          <input
            type="tel"
            aria-label={label + ' ' + (index + 1)}
            class={inputClass}
            value={phone}
            oninput={event =>
              onchange(
                JSON.stringify(
                  phones.map((item, i) =>
                    i === index ? event.currentTarget.value : item,
                  ),
                ),
              )}
          ><button
            type="button"
            class="text-danger min-h-12 px-3"
            aria-label={t('remove_phone_number', { number: index + 1 })}
            onclick={() =>
              onchange(JSON.stringify(phones.filter((_, i) => i !== index)))}
          >
            ✕
          </button>
        </div>
      {/each}
      <button
        type="button"
        class="border-line min-h-12 rounded-xl border"
        onclick={() => onchange(JSON.stringify([...phones, '']))}
      >
        {t('add_number')}
      </button>
    </fieldset>
  {:else if field.dataType === 'link'}
    <fieldset {disabled} class="grid gap-3">
      <legend class="text-muted mb-2 text-sm">{label}</legend>
      {#each links as link, index (link.id)}
        <div class="border-line grid gap-2 rounded-xl border p-3">
          <label class="grid gap-1 text-sm"
            >{t('label')}<input
              class={inputClass}
              value={link.label.en ?? ''}
              oninput={e => updateLink(index, 'label', e.currentTarget.value)}
            ></label
          >
          <label class="grid gap-1 text-sm"
            >{t('url')}<input
              type="url"
              class={inputClass}
              value={link.url}
              oninput={e => updateLink(index, 'url', e.currentTarget.value)}
            ></label
          >
          <button
            type="button"
            class="text-danger min-h-12"
            onclick={() =>
              onchange(
                JSON.stringify({
                  version: 1,
                  items: links.filter((_, i) => i !== index),
                }),
              )}
          >
            {t('remove_link')}
          </button>
        </div>
      {/each}
      <button
        type="button"
        class="border-line min-h-12 rounded-xl border"
        disabled={links.length >= 16}
        onclick={() =>
          onchange(
            JSON.stringify({
              version: 1,
              items: [
                ...links,
                { id: crypto.randomUUID(), url: '', label: { en: '' } },
              ],
            }),
          )}
      >
        {t('add_link')}
      </button>
    </fieldset>
  {:else}
    <label for={'field-' + field.id} class="text-muted text-sm">{label}</label>
    {#if field.component === 'TextareaField'}
      <textarea
        id={'field-' + field.id}
        {disabled}
        class={inputClass}
        rows="4"
        value={String(value ?? '')}
        oninput={e => onchange(e.currentTarget.value || null)}
      ></textarea>
    {:else}
      <input
        id={'field-' + field.id}
        {disabled}
        class={inputClass}
        type={field.component === 'PhoneField'
          ? 'tel'
          : field.dataType === 'number'
            ? 'number'
            : field.dataType === 'date'
              ? 'date'
              : 'text'}
        min={field.min ?? undefined}
        max={field.max ?? undefined}
        step="any"
        value={String(value ?? '')}
        oninput={e =>
          onchange(
            e.currentTarget.value === ''
              ? null
              : field.dataType === 'number'
                ? Number(e.currentTarget.value)
                : e.currentTarget.value,
          )}
      >
    {/if}
  {/if}
  {#if !disabled && value != null}
    <button
      type="button"
      class="text-muted min-h-10 justify-self-end px-2 text-sm"
      onclick={() => {
        rangeError = ''
        rangeInput?.setCustomValidity('')
        onchange(null)
      }}
    >
      {t('clear_field', { field: label })}
    </button>
  {/if}
</div>
