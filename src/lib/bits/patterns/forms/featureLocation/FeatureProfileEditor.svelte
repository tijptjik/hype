<script lang="ts" generics="Field extends string = ProfileField">
// SVELTE
import { onDestroy, type Snippet } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { slide } from 'svelte/transition'
import { prefersReducedMotion } from 'svelte/motion'
import EditIcon from 'virtual:icons/lucide/pencil'
// I18N
import { getLocaleKey, m } from '#lib/i18n.js'
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions'
// COMPONENTS
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import {
  displayedLocales,
  shortLocaleLabel,
} from '#lib/bits/custom/localeControls/localeControls.js'
import {
  createProfileTranslator,
  hasProfileText,
  type ProfileField,
  type ProfileValues,
  type ProfileProviderResult,
  type ProfileTranslationResult,
} from './profileTranslation'
// ICONS
import UnlinkIcon from 'virtual:icons/lucide/unlink'
import LinkIcon from 'virtual:icons/lucide/link'
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nTranslationStatus from '../formI18nSection/components/FormI18nTranslationStatus.svelte'
// TYPES
import type { ProfileLocaleState } from './profileLocales'

let {
  localeState,
  onLocaleStateChange,
  values,
  contextKey,
  allowDescriptions = true,
  fieldConfigs,
  stackNames = false,
  showToolbar = true,
  stickyFieldHeaders = false,
  loading = false,
  retainContent = false,
  recordKey = '',
  inherited = false,
  policyRequired = false,
  offerName = false,
  isEditing = false,
  onUseName,
  onIndependentName,
  onEditLocation,
  translate,
  onTranslated,
  children,
}: {
  localeState: ProfileLocaleState
  onLocaleStateChange: (state: ProfileLocaleState) => void
  values: ProfileValues<Field>
  contextKey: string
  loading?: boolean
  retainContent?: boolean
  recordKey?: string
  fieldConfigs?: ReadonlyArray<{ key: Field; label: string }>
  stackNames?: boolean
  showToolbar?: boolean
  stickyFieldHeaders?: boolean
  allowDescriptions?: boolean
  inherited?: boolean
  policyRequired?: boolean
  offerName?: boolean
  isEditing?: boolean
  onUseName?: () => void
  onIndependentName?: () => void
  onEditLocation?: () => void
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  onTranslated: (field: Field, locale: string, text: string) => void
  children: Snippet<[Field, string, () => void, string]>
} = $props()
const showSkeleton = $derived(loading && !retainContent)
const options = $derived(contentLocaleOptions(getLocaleKey()))
const shown = $derived(displayedLocales(localeState, localeState.expanded))
const fields = $derived(
  fieldConfigs ??
    ((allowDescriptions
      ? [
          { key: 'title', label: m.feature__title() },
          { key: 'description', label: m.feature__description() },
        ]
      : [{ key: 'title', label: m.feature__title() }]) as unknown as Array<{
      key: Field
      label: string
    }>),
)
let fieldHeaderHeights = $state<Partial<Record<Field, number>>>({})

/** Measure each policy heading so locale badges stick below wrapped translation controls.
 * @param field Field owning this header. @returns Attachment with observer cleanup.
 */
function measureFieldHeader(field: Field): Attachment<HTMLElement> {
  return node => {
    const measure = (): void => {
      fieldHeaderHeights[field] = node.offsetHeight
    }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }
}

let busy = $state<Partial<Record<Field, boolean>>>({})
let busySource = $state<Partial<Record<Field, string>>>({})
let results = $state<Partial<Record<Field, ProfileTranslationResult[]>>>({})
const translator = createProfileTranslator<Field>({
  values: () => values,
  context: () => contextKey,
  locked: field =>
    !isEditing ||
    (field === 'title' && inherited) ||
    (field === 'description' && !allowDescriptions),
  translate: (source, target, text) => translate(source, target, text),
  apply: (field, locale, text) => onTranslated(field, locale, text),
})
let previous: Record<string, string> = {}
// Observe external/programmatic edits as well as the explicit row-edit invalidations.
$effect(() => {
  const next: Record<string, string> = {}
  for (const locale of localeState.selectedLocales)
    for (const { key: field } of fields) {
      const key = `${locale}:${field}`
      next[key] = values[contentFormKey(locale)]?.[field] ?? ''
      if (key in previous && next[key] !== previous[key])
        translator.touch(locale, field)
    }
  previous = next
})
$effect(() => {
  contextKey
  translator.cancel()
  results = {}
})
onDestroy(() => translator.cancel())
async function fill(source: string, field: Field): Promise<void> {
  if (busy[field]) return
  busy[field] = true
  busySource[field] = source
  results[field] = []
  const context = contextKey
  try {
    const result = await translator.run(source, field, localeState.selectedLocales)
    if (context === contextKey) results[field] = result
  } finally {
    busy[field] = false
    busySource[field] = undefined
  }
}
function name(locale: string): string {
  return options.find(option => option.tag === locale)?.name ?? locale
}
function autonym(locale: string): string {
  return options.find(option => option.tag === locale)?.autonym ?? locale
}
</script>

<section
  class="[&_.bits-form\_\_control-wrap]:bg-panel! px-6 pb-6"
  data-feature-profile-editor
  aria-busy={loading}
  inert={loading}
>
  {#if showToolbar}
    <div class="border-border/50 mb-6 border-b pb-3" inert={loading}>
      <LocaleToolbar
        {...localeState}
        {options}
        allowAdd={isEditing}
        onExpandedChange={expanded => onLocaleStateChange({ ...localeState, expanded })}
        onChange={change =>
          onLocaleStateChange({
            ...localeState,
            selectedLocales: change.selectedLocales,
            visibleLocales: change.visibleLocales,
          })}
      />
    </div>
  {/if}
  <div
    class="grid min-w-0 gap-x-6 gap-y-4 {stackNames
      ? 'md:grid-cols-3 md:grid-rows-[min-content_1fr]'
      : `${fields.length > 1 ? 'md:[&>section+section]:border-l md:[&>section+section]:border-border/50 md:[&>section+section]:pl-6' : ''} ${fields.length === 3 ? 'md:grid-cols-3' : fields.length === 2 ? 'md:grid-cols-2' : ''}`}"
  >
    {#each fields as { key: field, label } (field)}
      {@const derived = field === 'title' && inherited}
      {@const sources = localeState.selectedLocales.filter(locale =>
        hasProfileText(values[contentFormKey(locale)]?.[field]),
      )}
      {@const hasTargets = localeState.selectedLocales.some(
        locale => !hasProfileText(values[contentFormKey(locale)]?.[field]),
      )}
      <section
        class="min-w-0 {stackNames
          ? field === 'description'
            ? 'md:col-span-2 md:col-start-2 md:row-span-2 md:row-start-1 md:h-full md:border-l md:border-border/50 md:pl-6'
            : field === 'nameShort'
              ? 'md:col-start-1 md:row-start-2'
              : 'md:col-start-1 md:row-start-1'
          : ''}"
        style:--profile-field-header-height={`${fieldHeaderHeights[field] ?? 0}px`}
        data-profile-field={field}
      >
        <!-- Long policy documents keep their field-specific translation actions in view. -->
        <div
          class={stickyFieldHeaders
            ? 'sticky z-[210] bg-[var(--form-workspace,var(--color-panel))] py-2'
            : ''}
          style:top={stickyFieldHeaders
            ? 'var(--profile-locale-toolbar-height, 0px)'
            : undefined}
          {@attach stickyFieldHeaders ? measureFieldHeader(field) : undefined}
          data-profile-field-header
        >
          <div class="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
            <h3 class="text-sm font-semibold">
              {label}
            </h3>
            {#if derived}
              <div
                class="group/location-link hover:border-border/40 hover:bg-muted/20 focus-within:border-border/40 focus-within:bg-muted/20 inline-flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-transparent px-2 py-1 transition-colors duration-150 motion-reduce:transition-none"
                data-profile-derived
              >
                <span
                  class="text-muted-foreground inline-flex items-center gap-2 text-xs"
                  ><LinkIcon class="text-primary size-4 shrink-0" />
                  {m.feature_name_derived_help()}</span
                >
                {#if isEditing}
                  <div
                    class="flex flex-wrap items-center gap-1 overflow-hidden"
                    data-profile-edit-action
                    transition:slide={{
                      axis: 'x',
                      duration:
                        prefersReducedMotion.current ||
                        typeof globalThis.Element?.prototype.animate !== 'function'
                          ? 0
                          : 180,
                    }}
                  >
                    {#if !policyRequired}
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-primary inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs transition-colors focus-visible:outline-2 motion-reduce:transition-none"
                        onclick={onIndependentName}
                      >
                        <UnlinkIcon class="size-3.5" />{m.feature_separate_name()}
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="text-muted-foreground group-hover/location-link:text-primary group-focus-within/location-link:text-primary focus-visible:outline-primary inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-2 motion-reduce:transition-none"
                      onclick={onEditLocation}
                    >
                      <EditIcon class="size-3.5" />{m.feature_edit_location()}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
            <FormI18nTranslationStatus
              message={results[field]?.length
                ? [
                    m.profile_translation_complete({
                      count: results[field]!.filter(
                        result => result.status === 'translated',
                      ).length,
                    }),
                    ...results[field]!.filter(
                      result => result.status !== 'translated',
                    ).map(
                      result =>
                        `${name(result.locale)}: ${result.status === 'unsupported' ? m.profile_translation_unsupported() : result.status === 'stale' ? m.profile_translation_skipped() : m.address_translate_error()}`,
                    ),
                  ].join(' ')
                : ''}
            />
          </div>
          <FormI18nSourceBar
            visible={!showSkeleton &&
              localeState.expanded &&
              isEditing &&
              !derived &&
              sources.length > 0}
            sources={sources.map(source => ({
              locale: source,
              label: autonym(source),
              accessibleLabel: m.profile_translate_source({ language: name(source) }),
            }))}
            label={m.profile_translate_from()}
            busy={busy[field] ?? false}
            busySource={busySource[field]}
            disabled={!hasTargets}
            onTranslate={source => void fill(source, field)}
          />
        </div>
        <div class="mt-3">
          {#each localeState.selectedLocales as locale (locale)}
            <!-- Keep every locale registered with the form even while translations are collapsed. -->
            <div
              aria-hidden={!shown.includes(locale)}
              inert={!shown.includes(locale)}
              class="grid min-w-0 transition-[grid-template-rows,opacity,margin] duration-200 motion-reduce:transition-none"
              style:grid-template-rows={shown.includes(locale) ? '1fr' : '0fr'}
              style:opacity={shown.includes(locale) ? 1 : 0}
              style:margin-top={shown.includes(locale) && locale !== shown[0]
                ? '8px'
                : '0px'}
              data-profile-locale={locale}
            >
              <div
                class="relative min-h-0 {stickyFieldHeaders && shown.includes(locale)
                  ? 'overflow-visible'
                  : 'overflow-hidden'}"
              >
                {#if stickyFieldHeaders}
                  <!-- Each language identifies its own long document and releases at its end. -->
                  <div
                    class="sticky z-[200] bg-[var(--form-workspace,var(--color-panel))] py-2"
                    style:top="calc(var(--profile-locale-toolbar-height, 0px) + var(--profile-field-header-height, 0px))"
                    data-profile-locale-header={locale}
                    lang={canonicalContentTag(locale)}
                  >
                    <span
                      class="bg-muted/50 text-muted-foreground inline-flex rounded-md px-2 py-1 font-mono text-xs font-medium"
                      >{shortLocaleLabel(locale)}</span
                    >
                  </div>
                {/if}
                {#if showSkeleton && shown.includes(locale)}
                  <div
                    class="absolute inset-0 grid min-h-[42px] items-center gap-2 {!stickyFieldHeaders &&
                    locale !== shown[0]
                      ? 'grid-cols-[2.5rem_minmax(0,1fr)_2rem]'
                      : 'grid-cols-[minmax(0,1fr)_2rem]'}"
                    data-profile-skeleton-row
                  >
                    {#if !stickyFieldHeaders && locale !== shown[0]}
                      <span
                        class="text-muted-foreground text-center font-mono text-xs leading-[22px]"
                        >{shortLocaleLabel(locale)}</span
                      >
                    {/if}
                    <div class="min-w-0 pr-9 pl-3">
                      <Skeleton class={field === 'title' ? 'h-4 w-2/3' : 'h-4 w-4/5'} />
                    </div>
                    <div class="flex justify-center">
                      <Skeleton class="size-4 rounded-full" />
                    </div>
                  </div>
                {/if}
                <!-- Preserve actual field geometry, including wrapped content, beneath the skeleton. -->
                <div
                  class={showSkeleton ? 'invisible [&_*]:invisible!' : ''}
                  aria-hidden={showSkeleton}
                  inert={loading}
                >
                  {@render children(
                    field,
                    locale,
                    () => translator.touch(locale, field),
                    stickyFieldHeaders || locale === shown[0]
                      ? ''
                      : shortLocaleLabel(locale),
                  )}
                </div>
              </div>
            </div>
          {/each}
        </div>
        {#if !derived && !showSkeleton && field === 'title' && offerName && isEditing}
          <div
            class="bg-primary/5 mt-6 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-xs"
          >
            <span>{m.feature_use_location_name_prompt()}</span
            ><button
              type="button"
              class="text-primary hover:bg-primary/10 rounded-md px-3 py-2 font-medium"
              onclick={onUseName}
            >
              {m.feature_use_location_name()}
            </button>
          </div>
        {/if}
      </section>
    {/each}
  </div>
</section>
