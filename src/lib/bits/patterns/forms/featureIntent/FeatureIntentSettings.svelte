<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
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
import { getLocaleKey } from '#lib/i18n.js'
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
import { TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
// DOMAIN
import {
  FEATURE_LOCATION_KINDS,
  featureTypeLabel,
  type FeatureType,
  type FeatureNamingRules,
} from '#lib/features/intents.js'
// BITS COMPONENTS
import ContentSkeleton from '#lib/bits/custom/skeleton/ContentSkeleton.svelte'
import FormFieldSkeleton from '#lib/bits/patterns/forms/formSkeleton/components/FormFieldSkeleton.svelte'
// TYPES
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
}: {
  scopeType: FeatureIntentScope['type']
  scopeId: string
  draft?: string
  revision?: string
  onDraftChange?: (draft: string | undefined) => void
  disabled?: boolean
} = $props()
let policy = $state<FeatureIntentPolicy | null>(null)
let catalogue = $state<FeatureType[]>([])
let namingRules = $state<FeatureNamingRules>({})
let baselineNamingRules: FeatureNamingRules = {}
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
let multilingual = $state(false)
let selectedLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
let visibleLocales = $state<string[]>(['en', 'zh-Hant', 'zh-Hans'])
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const shownLocales = $derived(
  displayedLocales({ selectedLocales, visibleLocales }, multilingual),
)
const contentLocales = $derived(
  normalizeContentLocales(
    catalogue.flatMap(type => [
      ...Object.keys(type.labels ?? {}),
      ...((namingRules[type.id] ?? type.nameRule)?.conditions ?? []).flatMap(
        condition => Object.keys(condition.locales),
      ),
    ]),
  ),
)
$effect(() => {
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
      selectedLocales = [...selectedLocales, ...extra]
      visibleLocales = [...visibleLocales, ...extra]
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
    } else {
      const parsed = JSON.parse(incoming)
      inherits = parsed.definition === null
      if (parsed.definition) catalogue = parsed.definition
      namingRules = parsed.namingRules ?? baselineNamingRules
    }
  })
})
$effect(() => {
  if (!policy) return
  const definition = $state.snapshot(inherits ? null : catalogue)
  const rules = $state.snapshot(namingRules)
  const serialized = JSON.stringify({ definition, namingRules: rules })
  const next =
    serialized === baseline
      ? undefined
      : JSON.stringify({
          definition,
          namingRules: rules,
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
  namingRules = next
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
</script>

<svelte:window
  onkeydown={event => {
    if (event.key === 'Escape') removeMode = false
  }}
/>
<section
  class="flex min-w-0 flex-col"
  data-feature-type-settings
  style:--feature-type-toolbar-height={`${toolbarHeight}px`}
>
  <div
    class={`${responsiveSectionHeaderClasses} [&[data-fit="4"][data-fit]_[data-header-title-text]]:min-w-0! [&[data-fit="4"][data-fit]_[data-locale-toolbar]]:min-w-8! [&[data-fit="4"][data-fit]>header]:flex-wrap! [&[data-fit="4"][data-fit]>header>div:first-child]:min-w-0! [&[data-fit="4"][data-fit]>header>div:first-child]:flex-1! [&[data-fit="4"][data-fit]>header>div:first-child]:basis-full! [&[data-fit="4"][data-fit]>header>div:first-child>div]:w-full! [&[data-fit="4"][data-fit]>header>div:last-child]:w-full! [&[data-fit="4"][data-fit]>header>div:last-child]:flex-none!`}
    bind:offsetHeight={toolbarHeight}
    data-feature-type-toolbar
    use:fitSectionHeader
  >
    <SectionHeader
      title="Data Model"
      icon={DataModelIcon}
      showControlLabels
      description="Feature types and location rules"
    >
      {#snippet left()}
        <div class="flex min-w-0 items-center gap-4">
          <Header
            text="Data Model"
            icon={DataModelIcon}
            description="Feature types and location rules"
            size="sm"
            class="bits-form__section-header-heading w-auto! min-w-0"
          />
          <Button
            text="New"
            attrs={{ 'aria-label': 'New' }}
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
            selectedLocales = change.selectedLocales
            visibleLocales = change.visibleLocales
          }}
        />
      {/snippet}
      {#snippet afterControls()}
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label="Remove Type"
            aria-pressed={removeMode}
            disabled={!editable}
            onclick={() => (removeMode = !removeMode)}
            class="text-muted-foreground hover:bg-muted focus-visible:outline-primary inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs focus-visible:outline-2 disabled:opacity-50"
          >
            <Trash class="size-4" /><span data-control-label>Remove Type</span>
          </button>
          <span class="text-sm font-medium whitespace-nowrap">
            {scopeType === 'layer'
              ? 'Project Defaults'
              : scopeType === 'project'
                ? 'Hub Defaults'
                : 'Application Defaults'}
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
            >Custom</label
          >
        </div>
      {/snippet}
    </SectionHeader>
  </div>
  {#if loadError}
    <div class="grid gap-3 p-6">
      <p role="alert">Unable to load feature type settings.</p>
      <button type="button" onclick={() => (reload += 1)}>Retry</button>
    </div>
  {:else if !policy}
    <ContentSkeleton label="Loading feature types…"
      ><FeatureTypeSection title="Feature type" disabled expanded
        ><div class="grid gap-6 p-6">
          <FormFieldSkeleton label="Name" />
          <FormFieldSkeleton label="Description" multiline />
        </div></FeatureTypeSection
      ></ContentSkeleton
    >
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
            expanded={openTypeKey === undefined ? index === 0 : openTypeKey === key}
            onExpandedChange={expanded => (openTypeKey = expanded ? key : null)}
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
<DestructiveDialog bind:open={confirmRemove} onConfirm={removeType}>
  {#snippet title()}
    Remove type?
  {/snippet}
  {#snippet description()}
    Remove this type from the configuration draft. Existing features keep their accepted
    type.
  {/snippet}
</DestructiveDialog>
