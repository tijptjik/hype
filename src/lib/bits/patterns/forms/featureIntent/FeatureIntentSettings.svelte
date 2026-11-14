<script lang="ts">
// SVELTE
import { untrack, setContext, tick } from 'svelte'
import {
  registerTranslationReview,
  generateTranslationReview,
  completeTranslationReview,
  type TranslationReviewSection,
} from '#lib/forms/translationReview.js'
import {
  translationReviewGroupKey,
  type TranslationReviewGroup,
  type TranslationReviewGroupMember,
} from '#lib/forms/translationReviewGroup.js'
import type { TranslationSourceMode } from '#lib/forms/translationSource.js'
import TranslationReviewDialog from '../translationReview/TranslationReviewDialog.svelte'
// DRAG AND DROP
import { draggable, droppable, type DragDropState } from '@thisux/sveltednd'
import { getDropIndex } from '#lib/client/services/dragDrop.js'
// SHARED HEADER
import Header from '#lib/bits/custom/header/Header.svelte'
import { Button, DestructiveDialog } from '#lib/bits/core/index.js'
import { fitSectionHeader } from '#lib/bits/custom/form/fitSectionHeader.js'
import { responsiveSectionHeaderClasses } from '#lib/bits/custom/form/responsiveSectionHeader.styles.js'
import {
  getHeaderActionClasses,
  HEADER_NEW_BUTTON_CLASSES,
  HEADER_BUTTON_LABEL_CLASSES,
} from '#lib/bits/patterns/layout/header/components/headerPrimitives.styles.js'
import Plus from 'virtual:icons/proicons/add'
import Trash from 'virtual:icons/proicons/delete'

// I18N
import { m, getLocaleKey } from '#lib/i18n.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { contentLocaleOptions } from '../contentLocaleDefaults/contentLocaleOptions.js'
import { displayedLocales } from '#lib/bits/custom/localeControls/localeControls.js'
// BITS COMPONENTS
import SectionHeader from '#lib/bits/custom/form/SectionHeader.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
// ICONS
import DataModelIcon from 'virtual:icons/lucide/network'
// API
import { getFeatureIntentSettings } from '#lib/api/featureIntents.remote.js'
import FeatureTypeSection from './FeatureTypeSection.svelte'
import FeatureTypeEditor from './FeatureTypeEditor.svelte'
import FeatureIntentHelp from './FeatureIntentHelp.svelte'
import FeatureNamingUpdateDialog from './FeatureNamingUpdateDialog.svelte'
import { TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
// DOMAIN
import {
  DEFAULT_FEATURE_TYPES,
  featureTypeLabelValue,
  FEATURE_LOCATION_KINDS,
  featureTypeLabel,
  type FeatureType,
  type FeatureNamingRules,
} from '#lib/features/intents.js'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
// TYPES
import type { LocaleSelection } from '#lib/bits/custom/localeControls/localeControls.types.js'
import type {
  FeatureIntentScope,
  FeatureIntentPolicy,
} from '#lib/db/services/featureIntentPolicy.js'

let {
  scopeType,
  scopeId,
  draft,
  revision,
  onDraftChange,
  disabled = false,
  loadingOnly = false,
  onReveal,
  multilingual = $bindable(false),
  localeSelection = $bindable<LocaleSelection | null>(null),
}: {
  onReveal?: () => void
  multilingual?: boolean
  localeSelection?: LocaleSelection | null
  scopeType: FeatureIntentScope['type']
  scopeId: string
  draft?: string
  revision?: string
  onDraftChange?: (draft: string | undefined) => void
  disabled?: boolean
  /** Render the same pending surface before the resource form is available, without querying. */
  loadingOnly?: boolean
} = $props()
let policy = $state<FeatureIntentPolicy | null>(null)
let catalogue = $state<FeatureType[]>([])
let namingRules = $state<FeatureNamingRules>({})
let baselineNamingRules: FeatureNamingRules = {}
let namingUpdateToken = $state<string | undefined>()
let namingUpdateOptions = $state<
  import('#lib/features/intents.js').FeatureNamingUpdateOptions | undefined
>()
let pendingNamingTypeIds = $state<string[]>([])
let pendingNaming = $state<FeatureNamingRules | null>(null)
const customSwitchId = $props.id()
// Keep editor scroll targets clear of the responsive sticky toolbar.
let toolbarHeight = $state(0)
let inherits = $state(true)
const busy = false
let baseline = ''
let baselineCatalogue: FeatureType[] = []
let baselineInherits = true
let lastEmitted: string | undefined
let loadError = $state(false)
let reload = $state(0)
const selectedLocales = $derived(
  localeSelection?.selectedLocales ?? ['en', 'zh-Hant', 'zh-Hans'],
)
const visibleLocales = $derived(localeSelection?.visibleLocales ?? selectedLocales)
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const shownLocales = $derived(
  displayedLocales({ selectedLocales, visibleLocales }, multilingual),
)
const contentLocales = $derived(
  normalizeContentLocales(
    catalogue.flatMap(type => [
      ...selectedLocales.filter(locale => featureTypeLabelValue(type, locale).trim()),
      ...Object.keys(type.labels ?? {}),
      ...((namingRules[type.id] ?? type.nameRule)?.conditions ?? []).flatMap(
        condition => Object.keys(condition.locales),
      ),
    ]),
  ),
)
$effect(() => {
  if (loadingOnly) return
  const scope = { type: scopeType, id: scopeId }
  reload
  revision
  let cancelled = false
  policy = null
  loadError = false
  getFeatureIntentSettings(scope)
    .then(value => {
      if (cancelled) return
      policy = value
      namingRules = structuredClone(value.namingRules ?? {})
      namingUpdateToken = undefined
      namingUpdateOptions = undefined
      catalogue = structuredClone(value.types).map(type => ({
        ...type,
        nameRule: undefined,
        kind: type.kind ?? 'object',
        targetContexts: [
          ...new Set(
            (
              type.targetContexts ??
              TARGET_CONTEXTS.filter(kind => type.locationKinds.includes(kind))
            ).map(kind => (kind === 'infrastructure' ? ('built' as const) : kind)),
          ),
        ],
        relation: type.relation ?? 'locatedAt',
        unresolvedMode: type.unresolvedMode ?? 'prompt',
        associationRequired: false,
      }))
      // Reveal stored languages outside the default set without deleting hidden translations.
      const stored = normalizeContentLocales(
        value.types.flatMap(type => [
          ...Object.keys(type.labels ?? {}),
          ...(type.nameRule?.conditions ?? []).flatMap(condition =>
            Object.keys(condition.locales),
          ),
        ]),
      )
      const extra = stored.filter(locale => !selectedLocales.includes(locale))
      localeSelection = {
        selectedLocales: [...selectedLocales, ...extra],
        visibleLocales: [...visibleLocales, ...extra],
      }
      inherits = value.definition === null
      baselineInherits = inherits
      baselineCatalogue = structuredClone($state.snapshot(catalogue))
      baselineNamingRules = structuredClone($state.snapshot(namingRules))
      baseline = JSON.stringify({
        definition: inherits ? null : catalogue,
        namingRules,
      })
      lastEmitted = undefined
      const retained = untrack(() => draft)
      if (retained) {
        const parsed = JSON.parse(retained)
        inherits = parsed.definition === null
        if (parsed.definition) catalogue = parsed.definition
        namingRules = parsed.namingRules ?? baselineNamingRules
        namingUpdateToken = parsed.namingUpdateToken
        namingUpdateOptions = parsed.namingUpdateOptions
        lastEmitted = retained
      }
    })
    .catch(() => {
      if (!cancelled) loadError = true
    })
  return () => {
    cancelled = true
  }
})

// Parent reset/discard restores the local editor; the parent remains the only save owner.
$effect(() => {
  const incoming = draft
  if (!policy || incoming === lastEmitted) return
  untrack(() => {
    lastEmitted = incoming
    if (incoming === undefined) {
      catalogue = structuredClone(baselineCatalogue)
      inherits = baselineInherits
      namingRules = structuredClone(baselineNamingRules)
      namingUpdateToken = undefined
      namingUpdateOptions = undefined
      pendingNaming = null
    } else {
      const parsed = JSON.parse(incoming)
      inherits = parsed.definition === null
      if (parsed.definition) catalogue = parsed.definition
      namingRules = parsed.namingRules ?? baselineNamingRules
      namingUpdateToken = parsed.namingUpdateToken
      namingUpdateOptions = parsed.namingUpdateOptions
    }
  })
})
$effect(() => {
  if (!policy) return
  const definition = $state.snapshot(inherits ? null : catalogue)
  const rules = $state.snapshot(namingRules)
  const serialized = JSON.stringify({ definition, namingRules: rules })
  const next =
    serialized === baseline && !namingUpdateToken
      ? undefined
      : JSON.stringify({
          definition,
          namingRules: rules,
          namingUpdateToken,
          namingUpdateOptions,
          version: policy.version,
          fingerprint: policy.fingerprint,
        })
  if (next === lastEmitted) return
  lastEmitted = next
  untrack(() => onDraftChange?.(next))
})

/** Stage a naming-only override without materializing the inherited catalogue.
 * @param id Feature type key. @param rule Local rule, or undefined to resume inheritance.
 * @returns Nothing; the parent Save/Discard owns persistence.
 */
function changeNaming(id: string, rule: FeatureNamingRules[string] | undefined): void {
  const next = { ...namingRules }
  if (rule) next[id] = rule
  else delete next[id]
  pendingNamingTypeIds = [...new Set([...(namingUpdateOptions?.typeIds ?? []), id])]
  pendingNaming = next
}
/** Carry a local naming override with an explicitly renamed feature type.
 * @param before Previous key. @param after New key. @returns Nothing.
 */
function renameNaming(before: string, after: string): void {
  if (before === after || !Object.hasOwn(namingRules, before)) return
  const next = { ...namingRules, [after]: namingRules[before] }
  delete next[before]
  namingRules = next
}

let removeMode = $state(false)
// Undefined opens the first section initially; null allows every section to be closed.
let openTypeKey = $state<string | null | undefined>(undefined)
let removeKey = $state<string | null>(null)
let confirmRemove = $state(false)
const editable = $derived(!disabled && !busy && !inherits && Boolean(policy))
const dragGroup = `feature-types-${customSwitchId}`
const keys = new WeakMap<object, string>()
let keySequence = 0
/** Keep editor identity stable while the contributor edits the persisted identifier.
 * @param type Draft type. @returns Stable, form-local identity.
 */
function typeKey(type: FeatureType): string {
  let key = keys.get(type)
  if (!key) {
    key = `${dragGroup}-${++keySequence}`
    keys.set(type, key)
  }
  return key
}
/** Add a unique draft type and open it in place of the previous section.
 * @returns Nothing; the centralized parent Save persists the catalogue.
 */
function addType(): void {
  if (!editable || removeMode || catalogue.length >= 50) return
  let index = catalogue.length + 1
  while (catalogue.some(type => type.id === `type-${index}`)) index++
  catalogue = [
    ...catalogue,
    {
      id: `type-${index}`,
      // Draft content uses the canonical English label; UI language must not change its identity.
      label: 'New feature type',
      kind: 'object',
      targetContexts: ['building_part', 'building', 'premises', 'address'],
      relation: 'locatedAt',
      unresolvedMode: 'prompt',
      locationKinds: [...FEATURE_LOCATION_KINDS],
      start: 'search',
      associationRequired: false,
    },
  ]
  openTypeKey = typeKey(catalogue[catalogue.length - 1])
}
/** Reorder the draft array, the persisted source of display order.
 * @param from Current row. @param to Destination row. @returns Nothing.
 */
function moveType(from: number, to: number): void {
  if (
    !editable ||
    removeMode ||
    from < 0 ||
    to < 0 ||
    to >= catalogue.length ||
    from === to
  )
    return
  const next = [...catalogue]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  catalogue = next
}
/** Apply a same-list pointer drop through the keyboard reorder path.
 * @param state Drag state. @param target Target row key. @returns Nothing.
 */
function dropType(state: DragDropState, target: string): void {
  const ids = catalogue.map(typeKey)
  const to = getDropIndex(state, ids, target, dragGroup)
  if (
    to === null ||
    !state.draggedItem ||
    typeof state.draggedItem !== 'object' ||
    !('id' in state.draggedItem)
  )
    return
  moveType(ids.indexOf(String(state.draggedItem.id)), to)
}
/** Confirm removal from this draft only; existing features retain their type identity.
 * @returns Nothing. The last remaining type cannot be removed.
 */
function removeType(): void {
  if (editable && catalogue.length > 1) {
    const removed = catalogue.find(type => typeKey(type) === removeKey)
    if (removed) changeNaming(removed.id, undefined)
    catalogue = catalogue.filter(type => typeKey(type) !== removeKey)
  }
  removeKey = null
  confirmRemove = false
}

let reviewAnchor = $state<HTMLElement>()
let reviewOpen = $state(false)
let reviewStarted = $state(false)
let reviewExpanded = $state<string[]>([])
let reviewBusy = $state(false)
let reviewCompleted = $state(0)
let reviewTotal = $state(0)
let sourceFallback = $state(false)
let reviewMembers = $state<
  (TranslationReviewGroupMember & { registrationId: symbol })[]
>([])
const reviewGroup: TranslationReviewGroup = {
  open: () => reviewSection.open(),
  register(member) {
    const registrationId = Symbol()
    reviewMembers = [...reviewMembers, { ...member, registrationId }]
    return () => {
      reviewMembers = reviewMembers.filter(
        entry => entry.registrationId !== registrationId,
      )
    }
  },
}
setContext(translationReviewGroupKey, reviewGroup)
/** Identify empty active display-name locales, including pending suggestions.
 * @param type New Feature Flow section. @returns Whether its title should indicate review is needed.
 */
function typeMissingTranslations(type: FeatureType): boolean {
  return selectedLocales.some(locale => !featureTypeLabelValue(type, locale).trim())
}
const reviewSection: TranslationReviewSection = {
  generate: mode => generateReview(mode),
  close: () => {
    reviewOpen = false
  },
  outstandingKeys: () =>
    reviewMembers.flatMap(member => member.outstandingKeys?.() ?? []),
  missingKeys: () => reviewMembers.flatMap(member => member.missingKeys?.() ?? []),
  fingerprint: () => JSON.stringify(reviewMembers.map(member => member.fingerprint())),
  missing: () => editable && reviewMembers.some(member => member.missing()),
  acceptFilled: () => {
    for (const member of reviewMembers) member.acceptFilled?.()
  },
  open: () => {
    reviewOpen = true
    reviewStarted = true
    reviewExpanded = catalogue.filter(typeMissingTranslations).map(typeKey)
    multilingual = true
    localeSelection = { selectedLocales, visibleLocales: [...selectedLocales] }
    const first = catalogue.find(type =>
      selectedLocales.some(locale => !featureTypeLabelValue(type, locale).trim()),
    )
    if (first) openTypeKey = typeKey(first)
    onReveal?.()
    for (const member of reviewMembers) member.open()
    void tick().then(() => reviewAnchor?.scrollIntoView?.({ block: 'start' }))
  },
}
$effect(() => {
  const form = reviewAnchor?.closest('form')
  if (form && editable)
    return registerTranslationReview(form, reviewSection, reviewAnchor)
})
/** Generate suggestions across this tab, including collapsed type editors.
 * @param mode Requested source preference. @returns Completion of generation.
 */
async function generateReview(mode: TranslationSourceMode): Promise<void> {
  reviewExpanded = catalogue.filter(typeMissingTranslations).map(typeKey)
  reviewBusy = true
  reviewCompleted = 0
  sourceFallback = false
  reviewTotal = reviewMembers.reduce(
    (count, member) => count + (member.remaining?.() ?? 0),
    0,
  )
  try {
    for (const member of reviewMembers)
      await member.generate(mode, fallback => {
        sourceFallback ||= fallback === true
        if (!fallback) reviewCompleted += 1
      })
  } finally {
    reviewBusy = false
  }
}
/** Resolve this tab before continuing the owning form's save sequence.
 * @param accept Whether to retain suggestions. @returns Completion after the draft updates.
 */
async function finishReview(accept: boolean): Promise<void> {
  for (const member of reviewMembers) await member.finish(accept)
  await tick()
  if (accept && reviewMembers.some(member => member.missing())) return
  reviewOpen = false
  const form = reviewAnchor?.closest('form')
  if (form) completeTranslationReview(form, reviewSection)
}
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === 'Escape') removeMode = false
  }}
/>
<section
  bind:this={reviewAnchor}
  class="flex min-w-0 flex-col"
  data-feature-type-settings
  aria-busy={!policy && !loadError}
  inert={loadingOnly}
  style:--feature-type-toolbar-height={`${toolbarHeight}px`}
>
  <div
    class={`${responsiveSectionHeaderClasses} [&[data-fit="4"][data-fit]_[data-header-title-text]]:min-w-0! [&[data-fit="4"][data-fit]_[data-locale-toolbar]]:min-w-8! [&[data-fit="4"][data-fit]>header]:flex-wrap! [&[data-fit="4"][data-fit]>header>div:first-child]:min-w-0! [&[data-fit="4"][data-fit]>header>div:first-child]:flex-1! [&[data-fit="4"][data-fit]>header>div:first-child]:basis-full! [&[data-fit="4"][data-fit]>header>div:first-child>div]:w-full! [&[data-fit="4"][data-fit]>header>div:last-child]:w-full! [&[data-fit="4"][data-fit]>header>div:last-child]:flex-none!`}
    bind:offsetHeight={toolbarHeight}
    data-feature-type-toolbar
    use:fitSectionHeader
  >
    <SectionHeader
      title={m.feature_model_data_model()}
      icon={DataModelIcon}
      showControlLabels
      description={m.feature_model_model_description()}
    >
      {#snippet left()}
        <div class="flex min-w-0 items-center gap-4">
          <Header
            text={m.feature_model_data_model()}
            icon={DataModelIcon}
            description={m.feature_model_model_description()}
            size="sm"
            class="bits-form__section-header-heading w-auto! min-w-0"
          />
          <Button
            text={m.feature_model_new()}
            attrs={{ 'aria-label': m.feature_model_new() }}
            iconComponent={Plus}
            color="neutral"
            style="ghost"
            labelClasses={`${HEADER_BUTTON_LABEL_CLASSES} [[data-fit]:not([data-fit="0"])_&]:hidden!`}
            class={getHeaderActionClasses(`${HEADER_NEW_BUTTON_CLASSES} shrink-0`)}
            disabled={!editable || removeMode || catalogue.length >= 50}
            onClick={addType}
          />
        </div>
      {/snippet}
      {#snippet right()}
        <LocaleToolbar
          horizontal
          options={localeOptions}
          {selectedLocales}
          {visibleLocales}
          {contentLocales}
          expanded={multilingual}
          allowAdd={editable}
          class="min-w-0 grow basis-1/2 sm:grow-0 sm:basis-auto"
          onExpandedChange={expanded => (multilingual = expanded)}
          onChange={change => {
            localeSelection = change
          }}
        />
      {/snippet}
      {#snippet afterControls()}
        <div class="border-border ms-3 flex shrink-0 items-center gap-2 border-s ps-4">
          <span class="text-sm font-medium whitespace-nowrap">
            {scopeType === 'layer'
              ? m.feature_model_project_defaults()
              : scopeType === 'project'
                ? m.feature_model_hub_defaults()
                : m.feature_model_application_defaults()}
          </span>
          <Switch
            id={customSwitchId}
            checked={!inherits}
            disabled={disabled || busy || !policy}
            onCheckedChange={checked => {
              inherits = checked !== true
              if (inherits)
                namingRules = Object.fromEntries(
                  Object.entries(namingRules).filter(([id]) =>
                    policy?.inheritedTypes.some(type => type.id === id),
                  ),
                )
              removeMode = false
            }}
          />
          <label for={customSwitchId} class="text-sm font-medium whitespace-nowrap"
            >{m.feature_model_custom()}</label
          >
          <button
            type="button"
            aria-label={m.feature_model_remove_type()}
            aria-pressed={removeMode}
            disabled={!editable}
            onclick={() => (removeMode = !removeMode)}
            class="text-muted-foreground enabled:hover:text-destructive focus-visible:outline-primary inline-flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:outline-2 disabled:opacity-50"
          >
            <Trash class="size-5" />
          </button>
          <FeatureIntentHelp
            topic="model"
            label={m.feature_model_data_model()}
            {scopeType}
          />
        </div>
      {/snippet}
    </SectionHeader>
  </div>
  {#if loadError}
    <div class="grid gap-3 p-6">
      <p role="alert">{m.feature_model_load_failed()}</p>
      <button type="button" onclick={() => (reload += 1)}>{m.retry()}</button>
    </div>
  {:else if !policy}
    <!-- Both resource loading and policy loading reserve the actual initial editor geometry. -->
    <ContentSkeleton
      label={m.feature_model_loading()}
      class="[&_label]:text-muted-foreground! [&_label_*]:text-muted-foreground! [&_[data-type-editor]_span]:text-muted-foreground! [&_button]:bg-transparent! [&_input]:placeholder:text-transparent! [&_svg]:bg-transparent! [&_svg_*]:fill-transparent!"
    >
      {#each DEFAULT_FEATURE_TYPES as type, index (type.id)}
        <FeatureTypeSection
          title={featureTypeLabel(type, getLocaleKey())}
          kind={type.kind}
          enabled={type.enabled !== false}
          disabled
          expanded={index === 0}
        >
          <FeatureTypeEditor
            {type}
            {scopeType}
            {scopeId}
            locales={shownLocales}
            {multilingual}
            disabled
          />
        </FeatureTypeSection>
      {/each}
    </ContentSkeleton>
  {:else if inherits}
    <div data-inherited-schema>
      {#each policy.inheritedTypes as type, index (type.id)}
        <FeatureTypeSection
          title={featureTypeLabel(type, getLocaleKey())}
          kind={type.kind}
          enabled={type.enabled !== false}
          disabled
          expanded={openTypeKey === undefined
            ? index === 0
            : openTypeKey === typeKey(type)}
          onExpandedChange={expanded => (openTypeKey = expanded ? typeKey(type) : null)}
        >
          <FeatureTypeEditor
            {type}
            {scopeType}
            {scopeId}
            locales={shownLocales}
            {multilingual}
            namingDisabled={disabled || !policy || inherits}
            namingLocales={shownLocales}
            inheritedNameRule={policy.inheritedTypes.find(
              parent => parent.id === type.id,
            )?.nameRule}
            namingOverride={Object.hasOwn(namingRules, type.id)
              ? namingRules[type.id]
              : undefined}
            onNamingChange={rule => changeNaming(type.id, rule)}
            onIdChange={renameNaming}
            disabled
          />
        </FeatureTypeSection>
      {/each}
    </div>
  {:else}
    <div class="grid min-w-0" data-type-list>
      {#each catalogue as type, index (typeKey(type))}
        {@const key = typeKey(type)}
        <div
          class="relative min-w-0 before:hidden! after:hidden!"
          data-type-drop-zone={key}
          use:draggable={{
            container: `${dragGroup}-${key}`,
            containerGroup: dragGroup,
            dragData: { id: key },
            handle: '[data-type-drag-handle]',
            disabled: !editable || removeMode,
            attributes: { draggingClass: 'opacity-50' },
          }}
          use:droppable={{
            container: `${dragGroup}-${key}`,
            containerGroup: dragGroup,
            disabled: !editable || removeMode,
            callbacks: { onDrop: state => dropType(state, key) },
            attributes: { dragOverClass: 'ring-2 ring-primary/40' },
          }}
        >
          <FeatureTypeSection
            title={featureTypeLabel(type, getLocaleKey())}
            kind={type.kind}
            enabled={type.enabled !== false}
            onEnabledChange={enabled => (type.enabled = enabled)}
            disabled={!editable}
            {removeMode}
            canRemove={catalogue.length > 1}
            canMoveUp={index > 0}
            canMoveDown={index < catalogue.length - 1}
            missingTranslations={reviewStarted && typeMissingTranslations(type)}
            expanded={reviewExpanded.includes(key) ||
              (openTypeKey === undefined ? index === 0 : openTypeKey === key)}
            onExpandedChange={expanded => {
              reviewExpanded = expanded
                ? reviewExpanded
                : reviewExpanded.filter(item => item !== key)
              openTypeKey = expanded ? key : null
            }}
            onMove={direction => moveType(index, index + direction)}
            onRemove={() => {
              removeKey = key
              confirmRemove = true
            }}
          >
            <FeatureTypeEditor
              bind:type={catalogue[index]}
              {scopeType}
              {scopeId}
              {reviewGroup}
              reviewLocales={selectedLocales}
              locales={shownLocales}
              {multilingual}
              namingDisabled={disabled || !policy || inherits}
              namingLocales={shownLocales}
              inheritedNameRule={policy.inheritedTypes.find(
                parent => parent.id === type.id,
              )?.nameRule}
              namingOverride={Object.hasOwn(namingRules, type.id)
                ? namingRules[type.id]
                : undefined}
              onNamingChange={rule => changeNaming(type.id, rule)}
              onIdChange={renameNaming}
              disabled={!editable}
            />
          </FeatureTypeSection>
        </div>
      {/each}
    </div>
  {/if}
</section>
{#if reviewOpen}
  <TranslationReviewDialog
    form={reviewAnchor?.closest('form')}
    busy={reviewBusy}
    completed={reviewCompleted}
    total={reviewTotal}
    {sourceFallback}
    pending={reviewMembers.some(member => member.pending())}
    allReady={reviewMembers.every(member => !member.missing() || member.ready?.())}
    onGenerate={mode =>
      void generateTranslationReview(reviewAnchor?.closest('form'), mode)}
    onAccept={() => void finishReview(true)}
    onSkip={() => void finishReview(false)}
    onClose={() => (reviewOpen = false)}
  />
{/if}
<DestructiveDialog bind:open={confirmRemove} onConfirm={removeType}>
  {#snippet title()}
    {m.feature_model_remove_title()}
  {/snippet}
  {#snippet description()}
    {m.feature_model_remove_description()}
  {/snippet}
</DestructiveDialog>

{#if pendingNaming && policy}
  <FeatureNamingUpdateDialog
    policyScope={{ type: scopeType, id: scopeId }}
    typeIds={pendingNamingTypeIds}
    typeNames={pendingNamingTypeIds.map(
      id => catalogue.find(type => type.id === id)?.label ?? id,
    )}
    initialOptions={namingUpdateOptions}
    patch={{
      definition: inherits ? null : catalogue,
      namingRules: pendingNaming,
      version: policy.version,
      fingerprint: policy.fingerprint,
    }}
    onCancel={() => (pendingNaming = null)}
    onChoose={(token, options) => {
      if (!pendingNaming) return
      namingRules = pendingNaming
      namingUpdateToken = token
      namingUpdateOptions = options
      pendingNaming = null
    }}
  />
{/if}

{#if namingUpdateToken && !disabled}
  <div class="mt-4 flex flex-wrap items-center gap-3">
    <p class="text-muted-foreground text-sm">
      {m.feature_model_updates_pending()}
    </p>
    <Button
      text={m.feature_model_review_updates()}
      style="outline"
      onClick={() => {
        pendingNamingTypeIds = namingUpdateOptions?.typeIds ?? Object.keys(namingRules)
        pendingNaming = { ...namingRules }
      }}
    />
  </div>
{/if}
