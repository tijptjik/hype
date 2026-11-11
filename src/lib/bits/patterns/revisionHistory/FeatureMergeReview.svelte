<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// API
import { getProperty } from '#lib/api/property.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// MAP
import TaskMap from '#lib/bits/patterns/tasks/components/TaskMap.svelte'
import { locationMoveDistance } from '#lib/locations/reviewPresentation.js'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// COMPONENTS
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import MergeImportControl from './MergeImportControl.svelte'
import MergeComparisonRow from './MergeComparisonRow.svelte'
import MergePropertyValue from './MergePropertyValue.svelte'
import {
  mergePropertyComparison,
  mergePropertyEntries,
} from './mergePropertyDisplay.js'
import FeatureMergePhotos from './FeatureMergePhotos.svelte'
// DOMAIN
import { identityTitle } from './featureIdentity.types'
import { transitionReviewDialog } from '#lib/bits/core/dialog/dialogTransition.js'
// ICONS
import ReplaceIcon from 'virtual:icons/lucide/replace'
import DistanceIcon from 'virtual:icons/lucide/move-horizontal'
import DiffIcon from 'virtual:icons/lucide/diff'
// TYPES
import type { IdentitySource } from './featureIdentity.types'
import type { FeatureIdentitySelection } from '#lib/revisions/featureIdentityPlan.js'
type Output = FeatureIdentitySelection['outputs'][number]
let {
  sources,
  output = $bindable(),
  busy = false,
  onReplace,
}: {
  sources: IdentitySource[]
  output: Output
  busy?: boolean
  onReplace: () => void
} = $props()
const keep = $derived(sources[0])
const discard = $derived(sources[1])
const placementSource = $derived(
  sources.find(source => source.featureId === output.placementSourceFeatureId) ?? keep,
)
const inheritedLocation = $derived(placementSource.content.placement.location)
const languages = $derived(Object.keys(output.titles ?? {}))
const locale = $derived(languages.includes('en') ? 'en' : (languages[0] ?? 'en'))
let multilingual = $state(false)
let diffOnly = $state(false)
let visibleLocales = $state<string[]>([])
const shownLocales = $derived(
  multilingual
    ? languages.filter(
        language => !visibleLocales.length || visibleLocales.includes(language),
      )
    : [locale],
)
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const inputId = $props.id()
const field =
  'w-full min-w-0 rounded-md border border-transparent bg-transparent px-2 py-2 text-sm hover:border-border focus:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60'
const propertyGroups = $derived.by(() => {
  const ids = [
    ...new Set(sources.flatMap(source => Object.keys(source.content.properties))),
  ]
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const definition = (keep.content.properties[id] ?? discard.content.properties[id])
      .selection.definition
    const key =
      definition.type === 'classifier' || definition.selectedOption
        ? 'Categories'
        : ((
            {
              text: 'Text fields',
              number: 'Number fields',
              date: 'Dates',
              link: 'Links',
            } as Record<string, string>
          )[definition.dataType] ?? 'Other fields')
    groups.set(key, [...(groups.get(key) ?? []), id])
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, ids]) => ({
      label,
      ids: ids.sort((a, b) => propertyLabel(a).localeCompare(propertyLabel(b))),
    }))
})
type CategoryOption = { id: string; label: string }
let categoryOptions = $state<Record<string, CategoryOption[]>>({})
let categoryError = $state('')
$effect(() => {
  const ids = [
    ...new Set(
      sources.flatMap(source =>
        Object.entries(source.content.properties)
          .filter(([, row]) => row.selection.definition.type === 'classifier')
          .map(([id]) => id),
      ),
    ),
  ]
  const language = locale
  let cancelled = false
  untrack(() => {
    categoryOptions = {}
    categoryError = ''
    void Promise.allSettled(
      ids.map(async id => {
        const response = await refreshRemoteQuery(
          getProperty({ id, meta: { isAdminRequest: true } }),
        )
        if (cancelled) return
        if (!response.data) throw new Error('Category choices are unavailable')
        categoryOptions[id] = (response.data.values ?? []).map(option => ({
          id: option.id,
          label:
            option.i18n?.[language]?.value ??
            Object.values(option.i18n ?? {}).find(text => text?.value)?.value ??
            option.value ??
            'Unnamed option',
        }))
      }),
    ).then(results => {
      if (!cancelled && results.some(result => result.status === 'rejected'))
        categoryError =
          'Some category choices could not be loaded. Close and reopen this review to try again.'
    })
  })
  return () => {
    cancelled = true
  }
})

/** Read a point suitable for geographic comparison without assuming every geometry is a Point.
 * @param source Inspected record. @returns Longitude and latitude, or null.
 */
function coordinates(source: IdentitySource): [number, number] | null {
  const geometry = source.content.placement.geometry
  return geometry?.type === 'Point'
    ? [geometry.coordinates[0], geometry.coordinates[1]]
    : null
}
const separation = $derived.by(() => {
  const a = coordinates(keep),
    b = coordinates(discard)
  if (!a || !b) return ''
  const metres = locationMoveDistance(a, b)
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
})

/** Choose an allowed catalogue option while retaining the inspected field's identity.
 * @param id Category field. @param optionId Selected option, or empty to clear. @returns Nothing.
 */
function chooseOption(id: string, optionId: string): void {
  if (!output.properties?.some(row => row.propertyId === id)) {
    const source = sources.find(source => source.content.properties[id])
    if (source) chooseProperty(id, source.featureId)
  }
  output.propertyOptionEdits ??= {}
  output.propertyOptionEdits[id] = optionId || null
  delete output.propertyEdits?.[id]
  delete output.propertyTranslationEdits?.[id]
}

/** Select a complete location and its inherited fields together.
 * @param source Inspected placement owner. @returns Nothing.
 */
function choosePlacement(source: IdentitySource): void {
  output.placementSourceFeatureId = source.featureId
  const location = source.content.placement.location
  if (!location) return
  // Shared names and phone fields cannot remain attached to the previous Location.
  if (location.acceptancePolicy?.nameMode !== 'independent')
    for (const language of languages)
      output.titles![language] =
        source.content.translations[language]?.title.value ?? ''
  for (const id of new Set(
    sources.flatMap(record => Object.keys(record.content.properties)),
  )) {
    if (
      !sources.some(
        record =>
          record.content.properties[id]?.selection.definition.component ===
          'PhoneField',
      )
    )
      continue
    output.properties = (output.properties ?? []).filter(
      field => field.propertyId !== id,
    )
    if (source.content.properties[id]) chooseProperty(id, source.featureId)
    delete output.propertyOptionEdits?.[id]
    delete output.propertyEdits?.[id]
    delete output.propertyTranslationEdits?.[id]
  }
}

/** Resolve field text from its inspected option label rather than exposing an opaque ID.
 * @param source Inspected record. @param id Field ID. @param language Visible content language. @returns Display value.
 */
function propertyText(source: IdentitySource, id: string, language = locale): string {
  const row = source.content.properties[id]
  if (!row) return ''
  return (
    row.translations[language]?.value ??
    row.selection.definition.selectedOption?.translations[language]?.value ??
    row.selection.definition.selectedOption?.value ??
    Object.values(row.selection.definition.selectedOption?.translations ?? {})[0]
      ?.value ??
    row.selection.value ??
    row.selection.valueJson ??
    ''
  )
}
/** Resolve a readable label for an inspected field.
 * @param id Field ID. @returns Localized label or field key.
 */
function propertyLabel(id: string): string {
  const definition = (keep.content.properties[id] ?? discard.content.properties[id])
    .selection.definition
  return (
    definition.labels[locale]?.value ??
    Object.values(definition.labels)[0]?.value ??
    definition.key
  )
}
/** Select a complete inspected field, including its option context and translations.
 * @param id Field ID. @param sourceId Source chosen for the kept result. @returns Nothing.
 */
function chooseProperty(id: string, sourceId: string): void {
  output.properties = [
    ...(output.properties ?? []).filter(property => property.propertyId !== id),
    { propertyId: id, sourceFeatureId: sourceId },
  ]
  delete output.propertyOptionEdits?.[id]
  delete output.propertyEdits?.[id]
  delete output.propertyTranslationEdits?.[id]
}
/** Read the exact selected field and any explicit result edits.
 * @param id Field ID. @param language Visible content language. @returns Display value.
 */
function resultText(id: string, language: string): string {
  if (Object.hasOwn(output.propertyOptionEdits ?? {}, id)) {
    const optionId = output.propertyOptionEdits![id]
    return optionId
      ? (categoryOptions[id]?.find(option => option.id === optionId)?.label ?? '')
      : ''
  }
  if (Object.hasOwn(output.propertyTranslationEdits?.[id] ?? {}, language))
    return output.propertyTranslationEdits![id][language] ?? ''
  if (Object.hasOwn(output.propertyEdits ?? {}, id))
    return output.propertyEdits![id] ?? ''
  const source = sources.find(
    source =>
      source.featureId ===
      output.properties?.find(property => property.propertyId === id)?.sourceFeatureId,
  )
  return source ? propertyText(source, id, language) : ''
}
/** Update only the result column; server validation remains authoritative.
 * @param id Field ID. @param language Visible content language. @param value Edited result. @param translated Whether this field owns translations. @returns Nothing.
 */
function editProperty(
  id: string,
  language: string,
  value: string,
  translated: boolean,
): void {
  if (translated) {
    output.propertyTranslationEdits ??= {}
    output.propertyTranslationEdits[id] ??= {}
    output.propertyTranslationEdits[id][language] = value || null
  } else {
    output.propertyEdits ??= {}
    output.propertyEdits[id] = value || null
  }
}
</script>

<div
  class="grid min-w-0 grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] gap-x-2 gap-y-3 sm:gap-x-4"
>
  <div
    class="bg-panel sticky top-0 z-10 col-span-3 grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] gap-x-2 pb-3 sm:gap-x-4"
  >
    <header
      class="border-border/50 bg-surface/40 min-w-0 space-y-2 rounded-lg border px-3 py-4 text-right sm:px-5"
    >
      <span
        class="text-foreground/70 block text-2xl leading-none font-normal tracking-[-0.035em] sm:text-3xl"
        >Discard</span
      >
      <h3 class="text-[13px] leading-snug font-medium break-words whitespace-normal">
        {identityTitle(discard)}
      </h3>
    </header>
    <span></span>
    <header
      class="group/keep border-primary/35 border-l-primary relative min-w-0 space-y-2 rounded-lg border border-l-2 bg-[color-mix(in_oklab,var(--color-primary)_18%,#171923)] px-3 py-4 text-white sm:px-5"
    >
      <span
        class="block pr-7 text-2xl leading-none font-normal tracking-[-0.035em] sm:text-3xl"
        >Keep</span
      >
      <button
        type="button"
        class="absolute top-2 right-2 flex size-7 items-center justify-center rounded-md border border-white/30 bg-transparent text-white opacity-0 transition-opacity group-hover/keep:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-current [@media(hover:none)]:opacity-100"
        aria-label="Replace kept Feature"
        disabled={busy}
        onclick={onReplace}
      >
        <ReplaceIcon class="size-4" />
      </button>
      <h3 class="text-[13px] leading-snug font-medium break-words whitespace-normal">
        {identityTitle(keep)}
      </h3>
    </header>
  </div>
  {#each [discard, keep] as record, index}
    {#if index === 1}
      {#if separation}
        <fieldset
          aria-label="Distance between locations"
          class="text-muted-foreground flex min-w-0 flex-col items-center justify-center gap-1.5 self-stretch text-center text-[10px] font-medium sm:text-xs"
        >
          <span class="whitespace-nowrap tabular-nums">{separation}</span>
          <DistanceIcon class="h-4 w-6 opacity-60" aria-hidden="true" />
        </fieldset>
      {:else}
        <span></span>
      {/if}
    {/if}
    <div class="border-border min-w-0 overflow-hidden rounded-lg border">
      {#if coordinates(record)}
        <TaskMap
          coordinates={coordinates(record)!}
          addressMeta={null}
          initialZoom={15}
          showFullscreen={false}
          label={`${index === 0 ? 'Discard' : 'Keep'} location`}
          class="h-36 min-h-0!"
        />
      {:else}
        <p class="text-muted-foreground px-3 py-8 text-center text-sm">
          No map location supplied
        </p>
      {/if}
    </div>
  {/each}
  {#if categoryError}
    <p role="status" class="text-error col-span-3 text-sm">{categoryError}</p>
  {/if}
  <div
    class="border-border col-span-3 mt-4 flex items-center justify-between gap-3 border-b pb-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
  >
    <h4 class="col-start-2 text-center font-medium">Profile</h4>
    <div class="col-start-3 flex min-w-0 flex-wrap items-center justify-end gap-2">
      <LocaleToolbar
        class="min-w-0 max-sm:[&_[data-control-label]]:hidden"
        selectedLocales={languages}
        visibleLocales={visibleLocales.length ? visibleLocales : languages}
        options={localeOptions}
        expanded={multilingual}
        onExpandedChange={value =>
          transitionReviewDialog(() => {
            multilingual = value
          })}
        onChange={change => {
          visibleLocales = change.visibleLocales
        }}
        allowAdd={false}
        disabled={busy}
      />
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary focus-visible:outline-primary inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium focus-visible:outline-2"
        aria-pressed={diffOnly}
        disabled={busy}
        onclick={() =>
          transitionReviewDialog(() => {
            diffOnly = !diffOnly
          })}
      >
        <DiffIcon class="size-4 shrink-0" aria-hidden="true" />
        Diff Only
      </button>
    </div>
  </div>
  {#each ['title', 'description'] as key}
    <div class="contents [&:not(:has([data-merge-row]))]:hidden">
      <h5 class="text-muted-foreground col-span-3 mt-2 text-center text-xs font-medium">
        {key === 'title' ? 'Name' : 'Description'}
      </h5>
      {#each shownLocales as language}
        {@const incoming =
          key === 'title'
            ? (discard.content.translations[language]?.title.value ?? '')
            : (discard.content.translations[language]?.description.value ?? '')}
        {@const existing =
          key === 'title'
            ? (keep.content.translations[language]?.title.value ?? '')
            : (keep.content.translations[language]?.description.value ?? '')}
        {@const current =
          key === 'title'
            ? (output.titles?.[language] ?? '')
            : (output.descriptions?.[language] ?? '')}
        <MergeComparisonRow {diffOnly} {incoming} {existing}>
          <div
            class="flex min-w-0 flex-row-reverse items-start gap-2 py-2 text-right text-sm"
          >
            {#if multilingual}
              <span
                class="text-muted-foreground shrink-0 font-mono text-xs whitespace-nowrap"
                data-merge-locale
                >{shortLocaleLabel(language)}</span
              >
            {/if}
            <p class="min-w-0 break-words whitespace-pre-wrap">{incoming || '—'}</p>
          </div>
          <MergeImportControl
            {incoming}
            {existing}
            {current}
            label={`${key} ${language}`}
            disabled={busy ||
              (key === 'title' &&
                Boolean(
                  inheritedLocation &&
                    inheritedLocation.acceptancePolicy?.nameMode !== 'independent',
                ))}
            onToggle={importing => {
              if (key === 'title')
                output.titles![language] = importing ? incoming : existing
              else
                output.descriptions![language] =
                  (importing ? incoming : existing) || null
            }}
          />
          <div class="flex min-w-0 items-start gap-2">
            {#if multilingual}
              <span
                class="text-muted-foreground shrink-0 pt-2 font-mono text-xs whitespace-nowrap"
                data-merge-locale
                >{shortLocaleLabel(language)}</span
              >
            {/if}
            {#if key === 'title'}
              <input
                id={`${inputId}-${key}-${language}`}
                class={field}
                value={current}
                aria-label={`Keep name ${language}`}
                disabled={busy ||
                  Boolean(
                    inheritedLocation &&
                      inheritedLocation.acceptancePolicy?.nameMode !== 'independent',
                  )}
                oninput={event =>
                  (output.titles![language] = event.currentTarget.value)}
              >
            {:else}
              <textarea
                id={`${inputId}-${key}-${language}`}
                class={field}
                rows="3"
                value={current}
                aria-label={`Keep description ${language}`}
                disabled={busy}
                oninput={event =>
                  (output.descriptions![language] = event.currentTarget.value || null)}
              ></textarea>
            {/if}
          </div>
        </MergeComparisonRow>
      {/each}
    </div>
  {/each}
  <div class="contents [&:not(:has([data-merge-row]))]:hidden">
    <h4 class="border-border col-span-3 mt-5 border-b pb-2 text-center font-medium">
      Status
    </h4>
    {#each [
      {
        key: 'isIntangible',
        label: 'Feature status',
        incoming: discard.content.profile.isIntangible,
        existing: keep.content.profile.isIntangible,
        yes: 'Historical',
        no: 'Current',
      },
      {
        key: 'isVisitable',
        label: 'Visits',
        incoming: discard.content.profile.visitability.isVisitable,
        existing: keep.content.profile.visitability.isVisitable,
        yes: 'Visitable',
        no: 'Not visitable',
      },
    ] as row}
      <MergeComparisonRow {diffOnly} incoming={row.incoming} existing={row.existing}>
        <h5 class="text-muted-foreground col-span-3 text-center text-xs">
          {row.label}
        </h5>
        <p class="self-center text-right text-sm">{row.incoming ? row.yes : row.no}</p>
        <MergeImportControl
          incoming={row.incoming}
          existing={row.existing}
          current={row.key === 'isIntangible'
            ? output.profileEdits?.isIntangible
            : output.profileEdits?.isVisitable}
          label={row.label}
          disabled={busy}
          onToggle={importing => {
            if (row.key === 'isIntangible')
              output.profileEdits!.isIntangible = importing
                ? row.incoming
                : row.existing
            else
              output.profileEdits!.isVisitable = importing ? row.incoming : row.existing
          }}
        />
        <select
          class={field}
          aria-label={`Keep ${row.label}`}
          disabled={busy}
          value={String(
            row.key === 'isIntangible'
              ? output.profileEdits?.isIntangible
              : output.profileEdits?.isVisitable,
          )}
          onchange={event => {
            if (row.key === 'isIntangible')
              output.profileEdits!.isIntangible = event.currentTarget.value === 'true'
            else output.profileEdits!.isVisitable = event.currentTarget.value === 'true'
          }}
        >
          <option value="false">{row.no}</option>
          <option value="true">{row.yes}</option>
        </select>
      </MergeComparisonRow>
    {/each}
    <MergeComparisonRow
      {diffOnly}
      incoming={discard.content.profile.visitability.asOf}
      existing={keep.content.profile.visitability.asOf}
    >
      <h5 class="text-muted-foreground col-span-3 text-center text-xs">Last seen</h5>
      {#if discard.content.profile.visitability.asOf}
        <input
          type="date"
          class="w-full min-w-0 self-center border-0 bg-transparent py-2 text-right text-sm [color-scheme:normal] [&::-webkit-calendar-picker-indicator]:hidden"
          aria-label="Discard last seen"
          value={discard.content.profile.visitability.asOf}
          readonly
          tabindex="-1"
        >
      {:else}
        <p class="self-center text-right text-sm">—</p>
      {/if}
      <MergeImportControl
        incoming={discard.content.profile.visitability.asOf}
        existing={keep.content.profile.visitability.asOf}
        current={output.profileEdits?.asOf}
        label="last seen"
        disabled={busy}
        onToggle={importing => {
          output.profileEdits ??= {}
          output.profileEdits.asOf = importing
            ? discard.content.profile.visitability.asOf
            : keep.content.profile.visitability.asOf
        }}
      />
      <input
        type="date"
        class={field}
        aria-label="Keep last seen"
        value={output.profileEdits?.asOf ?? ''}
        disabled={busy}
        oninput={event =>
          (output.profileEdits!.asOf = event.currentTarget.value || null)}
      >
      <p class="text-muted-foreground col-span-3 text-center text-xs">
        Choose whether to bring over the last seen date.
      </p>
    </MergeComparisonRow>
  </div>
  <MergeComparisonRow
    {diffOnly}
    incoming={discard.content.translations[locale]?.address.value ?? ''}
    existing={keep.content.translations[locale]?.address.value ?? ''}
  >
    <h4 class="border-border col-span-3 mt-5 border-b pb-2 text-center font-medium">
      Location
    </h4>
    <p class="min-w-0 self-center text-right text-sm break-words whitespace-normal">
      {discard.content.translations[locale]?.address.value || '—'}
    </p>
    <MergeImportControl
      incoming={discard.content.placement}
      existing={keep.content.placement}
      current={output.placementSourceFeatureId === discard.featureId
        ? discard.content.placement
        : keep.content.placement}
      label="location"
      disabled={busy}
      onToggle={importing => {
        choosePlacement(importing ? discard : keep)
      }}
    />
    <p class="min-w-0 rounded-md px-2 py-2 text-sm break-words whitespace-normal">
      {(output.placementSourceFeatureId === discard.featureId ? discard : keep).content
        .translations[locale]?.address.value || '—'}
    </p>
  </MergeComparisonRow>
  {#each propertyGroups as group}
    <div class="contents [&:not(:has([data-merge-row]))]:hidden">
      <h4 class="border-border col-span-3 mt-5 border-b pb-2 text-center font-medium">
        {group.label}
      </h4>
      {#each group.ids as id}
        {@const chosen = output.properties?.find(
          property => property.propertyId === id,
        )}
        {@const chosenSource = sources.find(
          source => source.featureId === chosen?.sourceFeatureId,
        )}
        {@const definition = (
          keep.content.properties[id] ?? discard.content.properties[id]
        ).selection.definition}
        {@const selected = chosenSource?.content.properties[id]?.selection}
        {@const translated = definition.isTranslatable && !selected?.propertyValueId}
        {@const editable =
          selected &&
          definition.type !== 'classifier' &&
          definition.type !== 'category' &&
          !selected.propertyValueId &&
          !selected.valueJson &&
          ['text', 'number', 'date'].includes(definition.dataType) &&
          !(inheritedLocation && definition.component === 'PhoneField')}
        <div class="contents [&:not(:has([data-merge-row]))]:hidden">
          <h5 class="text-muted-foreground col-span-3 text-center text-xs font-medium">
            {propertyLabel(id)}
          </h5>
          {#each translated ? shownLocales : [locale] as language}
            {@const phone = definition.component === 'PhoneField'}
            {@const collection = mergePropertyEntries(resultText(id, language), phone)}
            {@const collectionField =
              collection !== null ||
              sources.some(
                source =>
                  mergePropertyEntries(propertyText(source, id, language), phone) !==
                  null,
              )}
            <MergeComparisonRow
              {diffOnly}
              incoming={mergePropertyComparison(
                propertyText(discard, id, language),
                phone,
              )}
              existing={mergePropertyComparison(
                propertyText(keep, id, language),
                phone,
              )}
            >
              <div
                class="flex min-w-0 flex-row-reverse gap-2 self-center text-right text-sm"
              >
                {#if translated && multilingual}
                  <span
                    class="text-muted-foreground shrink-0 font-mono text-xs whitespace-nowrap"
                    data-merge-locale
                    >{shortLocaleLabel(language)}</span
                  >
                {/if}
                <div class="min-w-0">
                  {#if definition.dataType === 'date' &&
                    propertyText(discard, id, language)}
                    <input
                      type="date"
                      class="w-full min-w-0 border-0 bg-transparent text-right text-sm [&::-webkit-calendar-picker-indicator]:hidden"
                      aria-label={`Discard ${propertyLabel(id)} ${language}`}
                      value={propertyText(discard, id, language)}
                      readonly
                      tabindex="-1"
                    >
                  {:else}
                    <MergePropertyValue
                      value={propertyText(discard, id, language)}
                      {phone}
                      label={`Discard ${propertyLabel(id)} ${language}`}
                    />
                  {/if}
                </div>
              </div>
              <MergeImportControl
                incoming={{
                  option:
                    discard.content.properties[id]?.selection.propertyValueId ?? null,
                  value: propertyText(discard, id, language),
                }}
                existing={{
                  option:
                    keep.content.properties[id]?.selection.propertyValueId ?? null,
                  value: propertyText(keep, id, language),
                }}
                current={{
                  option: Object.hasOwn(output.propertyOptionEdits ?? {}, id)
                    ? output.propertyOptionEdits![id]
                    : (selected?.propertyValueId ?? null),
                  value: resultText(id, language),
                }}
                label={`${propertyLabel(id)} ${language}`}
                disabled={busy ||
                  !discard.content.properties[id] ||
                  Boolean(inheritedLocation && definition.component === 'PhoneField')}
                onToggle={importing => {
                  const sourceId = importing ? discard.featureId : keep.featureId
                  if (
                    sources.find(source => source.featureId === sourceId)?.content
                      .properties[id]
                  )
                    chooseProperty(id, sourceId)
                }}
              />
              <div class="min-w-0 space-y-2">
                {#if definition.type === 'classifier'}
                  <select
                    class={field}
                    aria-label={`Keep ${propertyLabel(id)} category`}
                    disabled={busy || !categoryOptions[id]}
                    value={Object.hasOwn(output.propertyOptionEdits ?? {}, id)
                      ? (output.propertyOptionEdits![id] ?? '')
                      : (selected?.propertyValueId ?? '')}
                    onchange={event => chooseOption(id, event.currentTarget.value)}
                  >
                    <option value="">None</option>
                    {#each categoryOptions[id] ?? [] as option}
                      <option value={option.id}>{option.label}</option>
                    {/each}
                  </select>
                {:else if !editable}
                  <select
                    class={field}
                    aria-label={`Keep ${propertyLabel(id)} source ${language}`}
                    disabled={busy ||
                      Boolean(
                        inheritedLocation && definition.component === 'PhoneField',
                      )}
                    value={chosen?.sourceFeatureId ?? ''}
                    onchange={event => chooseProperty(id, event.currentTarget.value)}
                  >
                    {#each sources.filter(
                      source => source.content.properties[id],
                    ) as source}
                      <option value={source.featureId}>
                        {source.featureId === keep.featureId
                          ? 'Existing'
                          : 'Import'}{collectionField
                          ? ''
                          : `: ${propertyText(source, id, language) || 'Empty'}`}
                      </option>
                    {/each}
                  </select>
                {/if}
                {#if collection !== null || (collectionField && !editable)}
                  <MergePropertyValue
                    value={resultText(id, language)}
                    {phone}
                    label={`Keep ${propertyLabel(id)} ${language}`}
                    disabled={busy}
                    onChange={editable
                      ? value => editProperty(id, language, value, translated)
                      : undefined}
                  />
                {:else if editable}
                  <label class="flex min-w-0 items-start gap-2"
                    >{#if translated && multilingual}
                      <span
                        class="text-muted-foreground shrink-0 pt-2 font-mono text-xs whitespace-nowrap"
                        data-merge-locale
                        >{shortLocaleLabel(language)}</span
                      >
                    {/if}
                    <input
                      class={field}
                      type={definition.dataType === 'number'
                        ? 'number'
                        : definition.dataType === 'date'
                          ? 'date'
                          : 'text'}
                      aria-label={`Keep ${propertyLabel(id)} value ${language}`}
                      value={resultText(id, language)}
                      disabled={busy}
                      oninput={event =>
                        editProperty(
                          id,
                          language,
                          event.currentTarget.value,
                          translated,
                        )}
                    ></label
                  >
                {/if}
              </div>
            </MergeComparisonRow>
          {/each}
        </div>
      {/each}
    </div>
  {/each}
</div>
<FeatureMergePhotos {sources} bind:output {busy} />
