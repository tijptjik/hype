<script lang="ts" generics="Field extends string = ProfileField">
// SVELTE
import { getContext, onDestroy, tick, type Snippet } from 'svelte'
import type { Attachment } from 'svelte/attachments'
// HUB TRANSLATION REVIEW
import {
  hubTranslationReviewKey,
  translationSource,
  type TranslationSourceMode,
} from '#lib/forms/translationSource.js'
import TranslationReviewDialog from '../translationReview/TranslationReviewDialog.svelte'
import TranslationSuggestion from '../translationReview/TranslationSuggestion.svelte'
const inheritedHubReview =
  getContext<boolean | undefined>(hubTranslationReviewKey) ?? true
// ICONS
import ArrowUpIcon from 'virtual:icons/proicons/arrow-up'
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
  publishedProfileText,
  unconfirmedProfileText,
  type ProfileField,
  type ProfileValues,
  type ProfileProviderResult,
  type ProfileTranslationResult,
} from './profileTranslation'
// TRANSLATION REVIEW
import {
  registerTranslationReview,
  generateTranslationReview,
  completeTranslationReview,
  type TranslationReviewSection,
} from '#lib/forms/translationReview.js'
import { AutomaticTranslationSchema } from '#lib/i18n/automaticSchema.js'
import type { AutomaticTranslation } from '#lib/i18n/automatic.js'
import FormI18nInlineRow from '../formI18nSection/components/FormI18nInlineRow.svelte'
// TRANSLATION COMPONENTS
import FormI18nSourceBar from '../formI18nSection/components/FormI18nSourceBar.svelte'
import FormI18nTranslationStatus from '../formI18nSection/components/FormI18nTranslationStatus.svelte'
// STYLES
import { fieldLabelStyles } from '#lib/bits/custom/form/fieldTypography.styles.js'
// TYPES
import type { ProfileLocaleState } from './profileLocales'

let {
  hubReview = inheritedHubReview,
  localeState,
  onLocaleStateChange,
  values,
  contextKey,
  allowDescriptions = true,
  fieldConfigs,
  stackNames = false,
  showToolbar = true,
  stickyFieldHeaders = false,
  showPrimaryLocaleHeader = true,
  localeHeaderPlacement = 'above',
  loading = false,
  retainContent = false,
  recordKey = '',
  inherited = false,
  policyRequired = false,
  offerName = false,
  locationNames = {},
  isEditing = false,
  onUseName,
  onIndependentName,
  onEditLocation,
  translate,
  onTranslated,
  onAutomatic,
  onReveal,
  children,
  afterField,
  toolbarMessage,
  titleSource,
}: {
  localeState: ProfileLocaleState
  onLocaleStateChange: (state: ProfileLocaleState) => void
  values: ProfileValues<Field>
  contextKey: string
  loading?: boolean
  retainContent?: boolean
  recordKey?: string
  fieldConfigs?: ReadonlyArray<{ key: Field; label: string; readonly?: boolean }>
  stackNames?: boolean
  toolbarMessage?: Snippet
  /** Show title provenance and actions for each visible language. */
  titleSource?: Snippet<[string]>
  showToolbar?: boolean
  stickyFieldHeaders?: boolean | ReadonlyArray<Field>
  showPrimaryLocaleHeader?: boolean
  localeHeaderPlacement?: 'above' | 'gutter'
  allowDescriptions?: boolean
  inherited?: boolean
  policyRequired?: boolean
  offerName?: boolean
  locationNames?: Readonly<Record<string, string>>
  isEditing?: boolean
  onUseName?: () => void
  onIndependentName?: () => void
  hubReview?: boolean
  onEditLocation?: () => void
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  onTranslated: (
    field: Field,
    locale: string,
    text: string,
    automatic?: AutomaticTranslation,
    humanVerified?: boolean,
  ) => void
  onAutomatic?: (field: Field, locale: string, automatic: AutomaticTranslation) => void
  onReveal?: () => void
  children: Snippet<[Field, string, () => void, string, Snippet]>
  /** Render field-level controls after all of its language rows. */
  afterField?: Snippet<[Field]>
} = $props()
const showSkeleton = $derived(loading && !retainContent)
const options = $derived(contentLocaleOptions(getLocaleKey()))
const shown = $derived(displayedLocales(localeState, localeState.expanded))
// Preview the visible title's language; identify the language when only a fallback name exists.
const locationNamePreview = $derived.by(() => {
  const names = Object.entries(locationNames).filter(([, name]) => name.trim())
  const preferred = contentFormKey(shown[0] ?? 'en')
  const candidate =
    names.find(([locale]) => contentFormKey(locale) === preferred) ?? names[0]
  return candidate
    ? {
        locale: candidate[0],
        name: candidate[1],
        fallback: contentFormKey(candidate[0]) !== preferred,
      }
    : null
})
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
      readonly?: boolean
    }>),
)
// Divide the full workspace into thirds; each field owns its inset padding.
const titleDescriptionColumns = $derived(
  fields.length === 2 && fields[0].key === 'title' && fields[1].key === 'description',
)
// Policy documents need roughly 720px each after editor controls and the divider.
const policyColumns = $derived(
  fields.length === 2 &&
    fields.every(
      field => field.key === 'privacyPolicy' || field.key === 'termsOfService',
    ),
)
let fieldHeaderHeights = $state<Partial<Record<Field, number>>>({})

/** Measure each field heading so locale badges stick below wrapped translation controls.
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

/** Show a return control only once its document starts above its sticky heading.
 * @param localized Whether the control belongs to a translation.
 * @returns Attachment that tracks scrolling and layout changes, with cleanup.
 */
function showScrollControl(localized: boolean): Attachment<HTMLButtonElement> {
  return button => {
    const target = button.closest<HTMLElement>(
      localized ? '[data-profile-locale]' : '[data-profile-field]',
    )
    const heading = button.closest<HTMLElement>(
      localized ? '[data-profile-locale-header]' : '[data-profile-field-header]',
    )
    if (!target || !heading) return
    let frame = 0
    const measure = (): void => {
      frame = 0
      // Reserve the control's space so visibility never shifts the sticky layout.
      button.style.visibility =
        target.getBoundingClientRect().top < heading.getBoundingClientRect().top - 2
          ? 'visible'
          : 'hidden'
    }
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(target)
    observer.observe(heading)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }
}

/** Return to a document's start without hiding it beneath the sticky controls.
 * @param button Activated scroll control. @param localized Whether to target this translation.
 * @returns Nothing.
 */
function scrollToStart(button: HTMLButtonElement, localized: boolean): void {
  const target = button.closest<HTMLElement>(
    localized ? '[data-profile-locale]' : '[data-profile-field]',
  )
  target?.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
  })
}

let busy = $state<Partial<Record<Field, boolean>>>({})
let busySource = $state<Partial<Record<Field, string>>>({})
let results = $state<Partial<Record<Field, ProfileTranslationResult[]>>>({})
const translator = createProfileTranslator<Field>({
  get allowUnconfirmedTargets() {
    return hubReview
  },
  values: () => values,
  context: () => contextKey,
  locked: field =>
    !isEditing ||
    fields.find(config => config.key === field)?.readonly === true ||
    (field === 'title' && inherited) ||
    (field === 'description' && !allowDescriptions),
  translate: (source, target, text) => translate(source, target, text),
  apply: (field, locale, text, automatic) => {
    proposals = { ...proposals, [`${locale}:${field}`]: { text, automatic } }
    if (automatic) onAutomatic?.(field, locale, automatic)
  },
})
let proposals = $state<
  Record<
    string,
    { text: string; automatic?: AutomaticTranslation; legacyValue?: string }
  >
>({})
let dismissed = $state<Record<string, boolean>>({})
let reviewOpen = $state(false)
let reviewStarted = $state(false)
let reviewGenerating = $state(false)
let beforeProposalEdit: { key: string; text: string } | undefined
let reviewElement = $state<HTMLElement>()
const missing = $derived(
  fields
    .filter(({ key }) => !translatorLocked(key))
    .flatMap(({ key }) => {
      const sources = (
        hubReview ? Object.keys(values) : localeState.selectedLocales
      ).filter(locale => hasProfileText(publishedProfileText(values, locale, key)))
      const hasContent =
        sources.length > 0 ||
        (hubReview &&
          Object.keys(values).some(locale =>
            hasProfileText(unconfirmedProfileText(values, locale, key)),
          ))
      return hasContent
        ? localeState.selectedLocales
            .filter(locale => !hasProfileText(values[contentFormKey(locale)]?.[key]))
            .map(locale => ({ field: key, locale, source: sources[0] }))
        : []
    }),
)
/** Respect inherited names and disabled content when detecting missing translations. */
function translatorLocked(field: Field): boolean {
  return (
    !isEditing ||
    fields.find(config => config.key === field)?.readonly === true ||
    (field === 'title' && inherited) ||
    (field === 'description' && !allowDescriptions)
  )
}
const reviewSection: TranslationReviewSection = {
  generate: mode => proposeMissing(mode),
  close: () => {
    reviewOpen = false
  },
  outstandingKeys: () => missing.map(item => `${item.field}:${item.locale}`),
  missingKeys: () =>
    missing
      .filter(
        item =>
          !hasProfileText(values[contentFormKey(item.locale)]?.[item.field]) &&
          !proposalIsCurrent(item.field, item.locale),
      )
      .map(item => `${item.field}:${item.locale}:empty`),
  acceptFilled: () => {
    for (const item of [...missing]) acceptProposal(item.field, item.locale)
  },
  fingerprint: () => JSON.stringify([contextKey, localeState.selectedLocales, values]),
  missing: () => missing.length > 0,
  open: () => {
    reviewOpen = true
    reviewStarted = true
    onReveal?.()
    onLocaleStateChange({
      ...localeState,
      expanded: true,
      visibleLocales: [...localeState.selectedLocales],
    })
    void tick().then(() => reviewElement?.scrollIntoView({ block: 'nearest' }))
  },
}
$effect(() => {
  const form = reviewElement?.closest('form')
  if (form && isEditing)
    return registerTranslationReview(form, reviewSection, reviewElement)
})
let reviewCompleted = $state(0)
let reviewTotal = $state(0)
let sourceFallback = $state(false)
/** Generate the missing fields in this tab without promoting any suggestion. */
async function proposeMissing(mode?: TranslationSourceMode): Promise<void> {
  if (hubReview && mode) {
    if (reviewGenerating) return
    reviewGenerating = true
    reviewCompleted = 0
    sourceFallback = false
    reviewTotal = missing.filter(
      item => !proposalIsCurrent(item.field, item.locale),
    ).length
    try {
      for (const item of [...missing].filter(
        item => !proposalIsCurrent(item.field, item.locale),
      )) {
        reviewElement
          ?.querySelector<HTMLElement>(
            `[data-translation-cell="${CSS.escape(`${item.locale}:${item.field}`)}"]`,
          )
          ?.scrollIntoView?.({ block: 'center' })
        const sources = Object.keys(values).filter(locale =>
          hasProfileText(values[contentFormKey(locale)]?.[item.field]),
        )
        const source = translationSource(item.locale, sources, mode)
        if (source) {
          if (mode === 'english' && !source.toLowerCase().startsWith('en'))
            sourceFallback = true
          await fill(source, item.field, [item.locale])
        }
        reviewCompleted += 1
      }
      // Keep the source chooser open to show completion and acceptance actions.
    } finally {
      reviewGenerating = false
    }
    return
  }
  for (const { key } of fields) {
    const target = missing.find(item => item.field === key)
    if (target) await fill(target.source, key)
  }
}
/** Check proposal freshness before enabling either individual or bulk acceptance.
 * @param field Field identity. @param locale Target language. @returns Whether explicit acceptance can resolve this cell.
 */
function proposalIsCurrent(field: Field, locale: string): boolean {
  const proposal = proposals[`${locale}:${field}`]
  return Boolean(
    proposal &&
      hasProfileText(proposal.text) &&
      !hasProfileText(publishedProfileText(values, locale, field)) &&
      (proposal.legacyValue === undefined ||
        unconfirmedProfileText(values, locale, field) === proposal.legacyValue) &&
      (!proposal.automatic ||
        values[contentFormKey(proposal.automatic.sourceLocale)]?.[field] ===
          proposal.automatic.sourceText),
  )
}
/** Accept one proposal into the ordinary form; the server records acceptance on save. */
function acceptProposal(field: Field, locale: string, edited = false): void {
  const key = `${locale}:${field}`
  const proposal = proposals[key]
  if (!proposal || !proposalIsCurrent(field, locale) || translatorLocked(field)) return
  if (
    proposal.legacyValue !== undefined &&
    unconfirmedProfileText(values, locale, field) !== proposal.legacyValue
  )
    return
  if (
    proposal.automatic &&
    values[contentFormKey(proposal.automatic.sourceLocale)]?.[field] !==
      proposal.automatic.sourceText
  )
    return
  if (hasProfileText(publishedProfileText(values, locale, field))) return
  onTranslated(field, locale, proposal.text, proposal.automatic, edited)
  const next = { ...proposals }
  delete next[key]
  proposals = next
  // Fade the retained field into its accepted presentation without moving its locale.
  void tick().then(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    reviewElement
      ?.querySelector<HTMLElement>(`[data-translation-cell="${CSS.escape(key)}"]`)
      ?.animate([{ opacity: 0.45 }, { opacity: 1 }], {
        duration: 180,
        easing: 'ease-out',
      })
  })
}
/** Finish this tab after an explicit acceptance or decision to leave values undefined. */
async function finishReview(accept: boolean): Promise<void> {
  if (accept) for (const item of [...missing]) acceptProposal(item.field, item.locale)
  await tick()
  // Failed/unsupported targets remain visible; Accept all never silently skips them.
  if (accept && missing.length) return
  reviewOpen = false
  reviewStarted = false
  const form = reviewElement?.closest('form')
  if (form) completeTranslationReview(form, reviewSection)
}
$effect(() => {
  if (!reviewOpen) return
  for (const item of missing) {
    const raw = values[contentFormKey(item.locale)]?.autoTranslated?.[item.field]
    let decoded: unknown = raw
    if (typeof raw === 'string') {
      try {
        decoded = JSON.parse(raw)
      } catch {
        decoded = null
      }
    }
    const parsed = AutomaticTranslationSchema.safeParse(decoded)
    const automatic = parsed.success ? parsed.data : undefined
    const key = `${item.locale}:${item.field}`
    if (dismissed[key]) continue
    if (
      automatic &&
      !proposals[key] &&
      values[contentFormKey(automatic.sourceLocale)]?.[item.field] ===
        automatic.sourceText
    )
      proposals = { ...proposals, [key]: { text: automatic.value, automatic } }
  }
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
  proposals = {}
  dismissed = {}
  reviewOpen = false
  reviewStarted = false
})
onDestroy(() => translator.cancel())
async function fill(
  source: string,
  field: Field,
  targets: readonly string[] = localeState.selectedLocales,
): Promise<void> {
  if (busy[field]) return
  busy[field] = true
  busySource[field] = source
  results[field] = []
  const context = contextKey
  try {
    const result = await translator.run(source, field, targets)
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
  bind:this={reviewElement}
  class="[&_.bits-form\_\_control-wrap]:bg-panel! px-6 pb-6 {policyColumns
    ? '@container/profile-editor'
    : ''}"
  data-feature-profile-editor
  aria-busy={loading}
  inert={loading}
>
  {#if showToolbar}
    <div
      class="border-border/50 mb-6 flex items-center gap-2 border-b pb-3"
      inert={loading}
    >
      {#if toolbarMessage}
        <div class="min-w-0 flex-1">{@render toolbarMessage()}</div>
      {/if}
      <div class="ml-auto min-w-0 shrink-0">
        <LocaleToolbar
          class={toolbarMessage
            ? '[&_[data-control-label]]:hidden sm:[&_[data-control-label]]:inline'
            : ''}
          {...localeState}
          {options}
          allowAdd={isEditing}
          onExpandedChange={expanded =>
            onLocaleStateChange({ ...localeState, expanded })}
          onChange={change =>
            onLocaleStateChange({
              ...localeState,
              selectedLocales: change.selectedLocales,
              visibleLocales: change.visibleLocales,
            })}
        />
      </div>
    </div>
  {/if}
  {#if reviewOpen && hubReview}
    <TranslationReviewDialog
      details={fields.flatMap(({ key, label }) => {
        const targets = missing
          .filter(item => item.field === key)
          .map(item => name(item.locale))
        return targets.length ? [`${label}: ${targets.join(', ')}`] : []
      })}
      form={reviewElement?.closest('form')}
      busy={reviewGenerating || Object.values(busy).some(Boolean)}
      completed={reviewCompleted}
      total={reviewTotal}
      {sourceFallback}
      pending={missing.some(item => proposalIsCurrent(item.field, item.locale))}
      allReady={missing.every(item => proposalIsCurrent(item.field, item.locale))}
      englishAvailable={missing.some(item =>
        Boolean(
          translationSource(
            item.locale,
            Object.keys(values).filter(locale =>
              hasProfileText(values[contentFormKey(locale)]?.[item.field]),
            ),
            'english',
          ),
        ),
      )}
      onGenerate={mode =>
        void generateTranslationReview(reviewElement?.closest('form'), mode)}
      onAccept={() => void finishReview(true)}
      onSkip={() => void finishReview(false)}
      onClose={() => {
        reviewOpen = false
      }}
    />
  {:else if reviewOpen}
    <div
      class="border-border mb-4 flex flex-wrap items-center gap-3 rounded-md border p-3"
      role="status"
    >
      <span class="text-sm"
        >{m.translation_review_missing({ count: missing.length })}</span
      >
      <button
        type="button"
        class="text-primary rounded px-3 py-2 text-sm"
        disabled={Object.values(busy).some(Boolean)}
        onclick={() => void proposeMissing()}
      >
        {m.translation_review_generate()}
      </button>
      <button
        type="button"
        class="text-primary rounded px-3 py-2 text-sm"
        disabled={(missing.length > 0 && !Object.keys(proposals).length) ||
          Object.values(busy).some(Boolean)}
        onclick={() => void finishReview(true)}
      >
        {m.translation_review_accept_all()}
      </button>
      <button
        type="button"
        class="text-muted-foreground rounded px-3 py-2 text-sm"
        disabled={Object.values(busy).some(Boolean)}
        onclick={() => void finishReview(false)}
      >
        {m.translation_review_keep_empty()}
      </button>
    </div>
  {/if}
  <div
    class="grid min-w-0 gap-x-6 gap-y-4 {titleDescriptionColumns
      ? 'md:-mx-6 md:gap-x-0 md:[&>section]:px-6'
      : ''} {policyColumns
      ? '@min-[100rem]/profile-editor:grid-cols-2 @min-[100rem]/profile-editor:[&>section+section]:border-l @min-[100rem]/profile-editor:[&>section+section]:border-border/50 @min-[100rem]/profile-editor:[&>section+section]:pl-6'
      : stackNames
        ? 'md:grid-cols-3 md:grid-rows-[min-content_1fr]'
        : `${fields.length > 1 ? 'md:[&>section+section]:border-l md:[&>section+section]:border-border/50 md:[&>section+section]:pl-6' : ''} ${fields.length === 3 ? 'md:grid-cols-3' : fields.length === 2 ? (titleDescriptionColumns ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : 'md:grid-cols-2') : ''}`}"
  >
    {#each fields as { key: field, label } (field)}
      {@const stickyHeader =
        stickyFieldHeaders === true ||
        (typeof stickyFieldHeaders !== 'boolean' && stickyFieldHeaders.includes(field))}
      {@const policyField = field === 'privacyPolicy' || field === 'termsOfService'}
      {@const derived = field === 'title' && inherited}
      {@const sources = localeState.selectedLocales.filter(locale =>
        hasProfileText(publishedProfileText(values, locale, field)),
      )}
      {@const hasTargets = localeState.selectedLocales.some(
        locale => !hasProfileText(publishedProfileText(values, locale, field)),
      )}
      {#snippet translationActions(compact = true)}
        <FormI18nSourceBar
          {compact}
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
          {hasTargets}
          onTranslate={source => void fill(source, field)}
        />
      {/snippet}
      {#snippet editorTranslationActions()}
        {@render translationActions()}
      {/snippet}
      <section
        class="min-w-0 {stackNames
          ? field === 'description'
            ? 'md:col-span-2 md:col-start-2 md:row-span-2 md:row-start-1 md:h-full md:border-l md:border-border/50 md:pl-6'
            : field === 'nameShort'
              ? 'md:col-start-1 md:row-start-2'
              : 'md:col-start-1 md:row-start-1'
          : ''}"
        style:--profile-field-header-height={`${fieldHeaderHeights[field] ?? 0}px`}
        style:scroll-margin-top="var(--profile-locale-toolbar-height, 0px)"
        data-profile-field={field}
      >
        <!-- Long descriptions and policy documents keep their translation actions in view.
             Use the same 28px label row and 8px control gap as the routing fields;
             keep the gap inside sticky headers so their measured height includes it. -->
        <div
          class={stickyHeader
            ? 'sticky z-[210] bg-[var(--form-workspace,var(--color-panel))] pb-2'
            : 'pb-2'}
          style:top={stickyHeader
            ? 'var(--profile-locale-toolbar-height, 0px)'
            : undefined}
          {@attach stickyHeader ? measureFieldHeader(field) : undefined}
          data-profile-field-header
        >
          <div
            class="flex min-h-7 w-full flex-wrap {field === 'title' && titleSource
              ? 'items-start'
              : 'items-center'} justify-between gap-x-4 gap-y-2"
          >
            <div class="flex min-h-7 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h3 class={fieldLabelStyles}>
                {label}
              </h3>
              {#if derived && !titleSource}
                <span class="text-muted-foreground text-xs whitespace-nowrap"
                  >{m.feature_name_derived_help()}</span
                >
              {/if}
              <FormI18nTranslationStatus
                message={results[field]?.length
                  ? [
                      hubReview
                        ? (results[field] ?? []).some(
                            result => result.status === 'translated',
                          )
                          ? m.translation_hub_ready()
                          : ''
                        : m.profile_translation_complete({
                            count: (results[field] ?? []).filter(
                              result => result.status === 'translated',
                            ).length,
                          }),
                      ...(results[field] ?? [])
                        .filter(result => result.status !== 'translated')
                        .map(
                          result =>
                            `${name(result.locale)}: ${result.status === 'unsupported' ? m.profile_translation_unsupported() : result.status === 'stale' ? m.profile_translation_skipped() : m.address_translate_error()}`,
                        ),
                    ].join(' ')
                  : ''}
              />
            </div>
            {#if stickyHeader && policyField}
              <button
                type="button"
                class="text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:outline-primary ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`${m.scroll_to_top()}: ${label}`}
                title={m.scroll_to_top()}
                style:visibility="hidden"
                {@attach showScrollControl(false)}
                onclick={event => scrollToStart(event.currentTarget, false)}
              >
                <ArrowUpIcon class="size-4" aria-hidden="true" />
              </button>
            {/if}
            {#if field === 'title' && titleSource && !showSkeleton}
              {@render titleSource(shown[0] ?? 'en')}
            {:else if derived}
              <div
                class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs"
                data-profile-derived
              >
                {#if isEditing}
                  <div class="flex items-center gap-3" data-profile-edit-action>
                    {#if !policyRequired}
                      <button
                        type="button"
                        class="text-primary decoration-primary/40 focus-visible:outline-primary rounded py-1 underline underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                        onclick={onIndependentName}
                      >
                        {m.feature_separate_name()}
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="text-primary decoration-primary/40 focus-visible:outline-primary rounded py-1 underline underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                      onclick={onEditLocation}
                    >
                      {m.feature_title_go_location()}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
          <div class="[[data-profile-field]:has([data-markdown-editor])_&]:hidden">
            {@render translationActions(false)}
          </div>
        </div>
        <div>
          {#each localeState.selectedLocales as locale (locale)}
            {@const proposal = proposals[`${locale}:${field}`]}
            {@const showLocaleHeader =
              stickyHeader && (showPrimaryLocaleHeader || locale !== shown[0])}
            {@const gutter = showLocaleHeader && localeHeaderPlacement === 'gutter'}
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
              style:scroll-margin-top="calc(var(--profile-locale-toolbar-height, 0px) + var(--profile-field-header-height, 0px))"
              data-profile-locale={locale}
            >
              <div
                class="relative min-h-0 min-w-0 {stickyHeader && shown.includes(locale)
                  ? 'overflow-visible'
                  : 'overflow-hidden'} {gutter
                  ? 'grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-2'
                  : ''}"
              >
                {#if showLocaleHeader}
                  <!-- Each language identifies its own long document and releases at its end. -->
                  <div
                    class="sticky z-[200] flex flex-col items-center gap-1 py-2 {gutter
                      ? 'self-start justify-self-center'
                      : 'bg-[var(--form-workspace,var(--color-panel))]'}"
                    style:top="calc(var(--profile-locale-toolbar-height, 0px) + var(--profile-field-header-height, 0px))"
                    data-profile-locale-header={locale}
                    lang={canonicalContentTag(locale)}
                  >
                    <span
                      class="text-muted-foreground inline-flex font-mono text-xs leading-[22px]"
                      >{shortLocaleLabel(locale)}</span
                    >
                    {#if policyField}
                      <!-- Keep the return control below the label without adding row height. -->
                      <button
                        type="button"
                        class="text-muted-foreground hover:text-foreground hover:bg-muted/50 focus-visible:outline-primary absolute top-full left-1/2 inline-flex size-7 -translate-x-1/2 items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                        aria-label={`${m.scroll_to_top()}: ${label} (${name(locale)})`}
                        title={m.scroll_to_top()}
                        style:visibility="hidden"
                        {@attach showScrollControl(true)}
                        onclick={event => scrollToStart(event.currentTarget, true)}
                      >
                        <ArrowUpIcon class="size-4" aria-hidden="true" />
                      </button>
                    {/if}
                  </div>
                {/if}
                {#if showSkeleton && shown.includes(locale)}
                  <div
                    class="absolute inset-0 grid min-h-[42px] items-center gap-2 {!stickyHeader &&
                    locale !== shown[0]
                      ? 'grid-cols-[2.5rem_minmax(0,1fr)_2rem]'
                      : 'grid-cols-[minmax(0,1fr)_2rem]'}"
                    data-profile-skeleton-row
                    style:left={gutter ? '3rem' : undefined}
                  >
                    {#if !stickyHeader && locale !== shown[0]}
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
                {#if field === 'title' &&
                  titleSource &&
                  locale !== shown[0] &&
                  shown.includes(locale) &&
                  !showSkeleton}
                  <div class="mb-2 flex min-w-0">{@render titleSource(locale)}</div>
                {/if}
                <!-- Preserve actual field geometry, including wrapped content, beneath the skeleton. -->
                <div
                  class="min-w-0 [&[data-missing-translation=true]_input]:outline [&[data-missing-translation=true]_input]:outline-1 [&[data-missing-translation=true]_input]:outline-red-600/50 [&[data-missing-translation=true]_textarea]:outline [&[data-missing-translation=true]_textarea]:outline-1 [&[data-missing-translation=true]_textarea]:outline-red-600/50 {showSkeleton
                    ? 'invisible [&_*]:invisible!'
                    : ''}"
                  data-missing-translation={(hubReview &&
                    reviewStarted &&
                    !hasProfileText(values[contentFormKey(locale)]?.[field]) &&
                    missing.some(
                      item => item.field === field && item.locale === locale,
                    )) ||
                    undefined}
                  data-translation-cell={`${locale}:${field}`}
                  aria-hidden={showSkeleton}
                  inert={loading}
                >
                  {#if proposal &&
                    !hasProfileText(publishedProfileText(values, locale, field))}
                    {#if hubReview}
                      <TranslationSuggestion
                        value={proposal.text}
                        multiline={[
                          'description',
                          'privacyPolicy',
                          'termsOfService',
                          'subscriptionBenefits',
                        ].includes(field)}
                        markdown={field === 'description' ||
                          field === 'privacyPolicy' ||
                          field === 'termsOfService'}
                        label={`${label} · ${name(locale)} · ${m.translation_hub_suggestion()}`}
                        prefix={stickyHeader || locale === shown[0]
                          ? ''
                          : shortLocaleLabel(locale)}
                        onChange={text => {
                          proposals = {
                            ...proposals,
                            [`${locale}:${field}`]: { ...proposal, text },
                          }
                        }}
                        onAccept={edited => acceptProposal(field, locale, edited)}
                        onReject={() => {
                          const key = `${locale}:${field}`
                          dismissed = { ...dismissed, [key]: true }
                          const next = { ...proposals }
                          delete next[key]
                          proposals = next
                        }}
                      />
                    {:else}
                      <FormI18nInlineRow
                        value={proposal.text}
                        label={`${label} · ${name(locale)} · AI suggestion`}
                        prefix={stickyHeader || locale === shown[0]
                          ? ''
                          : shortLocaleLabel(locale)}
                        multiline={field === 'description' ||
                          field === 'privacyPolicy' ||
                          field === 'termsOfService'}
                        editable={isEditing}
                        showVerification={false}
                        renderHtml={false}
                        attrs={{
                          oninput: (event: Event) => {
                            proposals = {
                              ...proposals,
                              [`${locale}:${field}`]: {
                                ...proposal,
                                text: (event.currentTarget as HTMLInputElement).value,
                              },
                            }
                          },
                        }}
                        issues={undefined}
                        required={false}
                        onStart={() => {
                          beforeProposalEdit = {
                            key: `${locale}:${field}`,
                            text: proposal.text,
                          }
                          translator.touch(locale, field)
                        }}
                        onCancel={() => {
                          if (beforeProposalEdit?.key === `${locale}:${field}`)
                            proposals = {
                              ...proposals,
                              [`${locale}:${field}`]: {
                                ...proposal,
                                text: beforeProposalEdit.text,
                              },
                            }
                        }}
                        onClear={() => {
                          const next = { ...proposals }
                          delete next[`${locale}:${field}`]
                          proposals = next
                        }}
                      />
                      <button
                        type="button"
                        class="text-primary my-1 rounded px-3 py-1 text-xs"
                        onclick={() => acceptProposal(field, locale)}
                      >
                        {m.translation_review_accept()}
                      </button>
                    {/if}
                  {/if}
                  <div
                    hidden={Boolean(
                      proposal &&
                        !hasProfileText(publishedProfileText(values, locale, field)),
                    )}
                  >
                    <!-- Acceptance reveals a fresh preview, not an editor left active behind the proposal. -->
                    {#key Boolean(
                      proposal &&
                        !hasProfileText(publishedProfileText(values, locale, field)),
                    )}
                      {@render children(
                        field,
                        locale,
                        () => translator.touch(locale, field),
                        stickyHeader || locale === shown[0]
                          ? ''
                          : shortLocaleLabel(locale),
                        editorTranslationActions,
                      )}
                    {/key}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
        {#if !titleSource &&
          !derived &&
          !showSkeleton &&
          field === 'title' &&
          offerName &&
          locationNamePreview &&
          isEditing}
          <div
            class="bg-primary/5 mt-6 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg p-3 text-xs"
            data-profile-name-offer
          >
            <div class="min-w-0 space-y-1">
              <p class="text-muted-foreground">
                {m.feature_use_location_name_prompt()}
                {#if locationNamePreview.fallback}
                  · {shortLocaleLabel(locationNamePreview.locale)}
                {/if}
              </p>
              <p
                class="min-w-0 text-sm font-medium break-words whitespace-normal"
                lang={canonicalContentTag(locationNamePreview.locale)}
              >
                {locationNamePreview.name}
              </p>
            </div>
            <button
              type="button"
              class="text-primary hover:bg-primary/10 focus-visible:outline-primary rounded-md px-3 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              onclick={onUseName}
            >
              {m.feature_use_location_name()}
            </button>
          </div>
        {/if}
        {@render afterField?.(field)}
      </section>
    {/each}
  </div>
</section>
