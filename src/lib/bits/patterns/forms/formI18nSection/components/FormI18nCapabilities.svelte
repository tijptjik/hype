<script lang="ts">
// TRANSLATION REVIEW
import { MultilingualReview } from '#lib/forms/multilingualReview.svelte.js'
import MultilingualReviewPanel from '../../translationReview/MultilingualReviewPanel.svelte'
import TranslationSuggestion from '../../translationReview/TranslationSuggestion.svelte'
// I18N
import { m } from '#lib/i18n.js'
import { canonicalContentTag, contentStorageTag } from '#lib/i18n/contentRecords.js'
// COMPONENTS
import FormI18nInlineRow from './FormI18nInlineRow.svelte'
import FormI18nSourceBar from './FormI18nSourceBar.svelte'
import FormI18nTranslationStatus from './FormI18nTranslationStatus.svelte'
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { hasMeaningfulText } from '../text.js'
// STYLES
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
// TYPES
import type { RemoteFormIssue } from '$app/server'
import type { CapabilityI18nRoot, CapabilityKey } from '#lib/capabilities.types.js'
import type { LocaleKey } from '#lib/types.js'

type CapabilityLabelField = {
  as: (type: 'text') => Record<string, unknown>
  set: (value: string) => unknown
  issues: () => RemoteFormIssue[] | undefined
}

type CapabilityFormFields = Partial<
  Record<
    CapabilityKey,
    {
      i18n?: Partial<Record<keyof CapabilityI18nRoot, CapabilityLabelField>>
    }
  >
>

let {
  fields,
  capabilityKeys = [],
  locales,
  visibleLocales = locales,
  expanded = false,
  currentLocaleKey,
  resetVersion = 0,
  onTranslate,
  onReveal,
  isEditing = false,
  isRequiredInPreflight,
}: {
  onReveal?: () => void
  fields: CapabilityFormFields
  capabilityKeys: CapabilityKey[]
  locales: string[]
  visibleLocales?: string[]
  expanded?: boolean
  currentLocaleKey: LocaleKey
  resetVersion?: number
  onTranslate?: (
    source: string,
    target: string,
    capabilityKey?: CapabilityKey,
  ) => Promise<boolean | void>
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
} = $props()

// Cap the desktop pane at four fields; subsequent capabilities flow to the next row.
const columns = $derived(Math.min(4, Math.max(1, capabilityKeys.length)))
const beforeEdit = new Map<string, string>()
const localeOptions = $derived(contentLocaleOptions(currentLocaleKey))
const values = $derived.by(() =>
  Object.fromEntries(
    capabilityKeys.map(key => [
      key,
      Object.fromEntries(
        locales.map(locale => [
          locale,
          String(fields[key]?.i18n?.[locale]?.as('text').value ?? ''),
        ]),
      ),
    ]),
  ),
)
let busy = $state<Partial<Record<CapabilityKey, string>>>({})
let messages = $state<Partial<Record<CapabilityKey, string>>>({})

/** Fill only empty translations for the capability whose source was chosen.
 * @param capabilityKey Capability owning the shared source control.
 * @param source Populated source language selected by the user.
 * @returns Completion after the owning form applies eligible translations.
 */
async function fill(capabilityKey: CapabilityKey, source: string): Promise<void> {
  if (!onTranslate || busy[capabilityKey] || !isEditing) return
  const version = resetVersion
  const sourceValue = values[capabilityKey]?.[source]
  const targets = locales.filter(
    locale => locale !== source && !hasMeaningfulText(values[capabilityKey]?.[locale]),
  )
  busy[capabilityKey] = source
  messages[capabilityKey] = ''
  let count = 0
  try {
    for (const target of targets) {
      if (
        version !== resetVersion ||
        values[capabilityKey]?.[source] !== sourceValue ||
        !isEditing ||
        !capabilityKeys.includes(capabilityKey)
      )
        break
      if (
        (await onTranslate(
          contentStorageTag(source),
          contentStorageTag(target),
          capabilityKey,
        )) !== false
      )
        count++
    }
    if (version === resetVersion)
      messages[capabilityKey] = m.profile_translation_complete({ count })
  } catch {
    if (version === resetVersion) messages[capabilityKey] = m.address_translate_error()
  } finally {
    busy[capabilityKey] = undefined
  }
}
const review = new MultilingualReview(
  () =>
    capabilityKeys.flatMap(key =>
      locales
        .filter(locale => fields[key]?.i18n?.[locale])
        .map(locale => ({
          key: `${key}:${locale}`,
          field: key,
          locale: canonicalContentTag(locale),
          value: values[key]?.[locale] ?? '',
          set: text => {
            fields[key]?.i18n?.[locale]?.set(text)
          },
        })),
    ),
  () => isEditing,
  () => onReveal?.(),
)
</script>

<div class="@container/capability-labels">
  <MultilingualReviewPanel {review} />
  <div
    class="grid min-w-0 grid-cols-1 gap-x-6 gap-y-8 px-6 pb-6 @min-[40rem]/capability-labels:grid-cols-[repeat(var(--capability-mid-columns),minmax(0,1fr))] @min-[64rem]/capability-labels:grid-cols-[repeat(var(--capability-columns),minmax(0,1fr))]"
    style:--capability-columns={columns}
    style:--capability-mid-columns={Math.min(2, columns)}
    data-capability-labels
  >
    {#each capabilityKeys as capabilityKey (capabilityKey)}
      {@const sources = locales.filter(locale =>
        hasMeaningfulText(values[capabilityKey]?.[locale]),
      )}
      <section class="min-w-0" data-capability-field={capabilityKey}>
        <div class="mb-2">
          <div
            class="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1"
          >
            <h3 class={`min-w-0 break-words ${fieldLabelStyles}`}>{capabilityKey}</h3>
            <FormI18nTranslationStatus message={messages[capabilityKey] ?? ''} />
          </div>
          <FormI18nSourceBar
            visible={expanded &&
              isEditing &&
              Boolean(onTranslate) &&
              sources.length > 0}
            sources={sources.map(locale => {
              const option = localeOptions.find(
                option => option.tag === canonicalContentTag(locale),
              )
              return {
                locale,
                label: option?.autonym ?? shortLocaleLabel(canonicalContentTag(locale)),
                accessibleLabel: m.profile_translate_source({
                  language: option?.name ?? locale,
                }),
              }
            })}
            label={m.profile_translate_from()}
            busy={Boolean(busy[capabilityKey])}
            busySource={busy[capabilityKey]}
            hasTargets={locales.some(
              locale => !hasMeaningfulText(values[capabilityKey]?.[locale]),
            )}
            onTranslate={locale => void fill(capabilityKey, locale)}
          />
        </div>
        <div>
          {#each locales as locale (locale)}
            {@const field = fields?.[capabilityKey]?.i18n?.[locale]}
            {#if field}
              {@const attrs = field.as('text')}
              {@const value = String(attrs.value ?? '')}
              {@const path = `${capabilityKey}.${locale}`}
              <!-- Keep every locale registered while the shared toolbar hides translations. -->
              <div
                lang={canonicalContentTag(locale)}
                data-capability-locale={locale}
                aria-hidden={!visibleLocales.includes(locale)}
                inert={!visibleLocales.includes(locale)}
                class="grid min-w-0 transition-[grid-template-rows,opacity,margin] duration-200 motion-reduce:transition-none"
                style:grid-template-rows={visibleLocales.includes(locale)
                  ? '1fr'
                  : '0fr'}
                style:opacity={visibleLocales.includes(locale) ? 1 : 0}
                style:margin-top={visibleLocales.includes(locale) &&
                locale !== visibleLocales[0]
                  ? '8px'
                  : '0px'}
              >
                <div
                  class="min-h-0 overflow-hidden"
                  data-missing-translation={(review.started &&
                    !value.trim() &&
                    review.missing.some(
                      cell => cell.key === `${capabilityKey}:${locale}`,
                    )) ||
                    undefined}
                >
                  {#if review.current(`${capabilityKey}:${locale}`)}
                    {@const key = `${capabilityKey}:${locale}`}
                    <TranslationSuggestion
                      value={review.proposals[key]?.value ?? ''}
                      label={`${capabilityKey} · ${shortLocaleLabel(canonicalContentTag(locale))}`}
                      prefix={shortLocaleLabel(canonicalContentTag(locale))}
                      onChange={text => {
                        if (review.proposals[key]) review.proposals[key].value = text
                      }}
                      onAccept={edited => review.accept(key, edited)}
                      onReject={() => review.reject(key)}
                    />
                  {:else}
                    <FormI18nInlineRow
                      label={`${capabilityKey} · ${shortLocaleLabel(canonicalContentTag(locale))}`}
                      prefix={locale === visibleLocales[0]
                        ? ''
                        : shortLocaleLabel(canonicalContentTag(locale))}
                      {attrs}
                      {value}
                      issues={field.issues()}
                      editable={isEditing}
                      showVerification={false}
                      required={isRequiredInPreflight([
                        'data',
                        'capabilities',
                        capabilityKey,
                        'i18n',
                        locale,
                      ])}
                      onStart={() => beforeEdit.set(path, value)}
                      onCancel={() => field.set(beforeEdit.get(path) ?? '')}
                      onClear={() => field.set('')}
                    />
                  {/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>
