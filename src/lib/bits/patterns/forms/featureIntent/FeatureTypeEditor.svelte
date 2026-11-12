<script lang="ts">
// SVELTE
import { tick } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
// UTILITIES
import { propertyKeyFromLabel } from '#lib/utils/nameIdentifier.js'
// COMPONENTS
import FeaturePolicyChoice from './FeaturePolicyChoice.svelte'
import { TextInput } from '#lib/bits/custom/form/index.js'
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import FeatureNamingPolicySettings from './FeatureNamingPolicySettings.svelte'
import FeatureNamingRuleEditor from './FeatureNamingRuleEditor.svelte'
import type { FeatureNameRule } from '#lib/features/locationPolicy.js'
// DOMAIN
import { TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
import { LOCATION_ENTITY_KINDS, locationTaxonomy } from '#lib/locations/taxonomy.js'
import { locationTaxonomyLabel } from '#lib/locations/taxonomy.i18n.js'
import FeatureTypeNames from './FeatureTypeNames.svelte'
import {
  typeInputAppearance,
  typeReadOnlyInputAppearance,
} from './featureTypeEditor.styles'
// TYPES
import type { FeatureType } from '#lib/features/intents.js'
import type { FeatureIntentScope } from '#lib/db/services/featureIntentPolicy.js'
let {
  type = $bindable(),
  scopeType,
  scopeId,
  locales,
  reviewLocales = locales,
  reviewGroup,
  multilingual,
  disabled = false,
  namingDisabled = disabled,
  namingLocales = locales,
  inheritedNameRule,
  namingOverride,
  onNamingChange,
  onIdChange,
}: {
  type: FeatureType
  scopeType: FeatureIntentScope['type']
  scopeId: string
  locales: string[]
  reviewLocales?: string[]
  reviewGroup?: import('#lib/forms/translationReviewGroup.js').TranslationReviewGroup
  multilingual: boolean
  disabled?: boolean
  namingDisabled?: boolean
  namingLocales?: string[]
  inheritedNameRule?: FeatureNameRule
  namingOverride?: FeatureNameRule
  onNamingChange?: (rule: FeatureNameRule | undefined) => void
  onIdChange?: (before: string, after: string) => void
} = $props()
const examples: Record<string, string> = {
  building_part: 'floor, lobby, wing, flat',
  premises: 'complex, campus, park, site',
  structure: 'tunnel, bridge, retaining wall',
  street: 'street',
}
const orderedTargets = [
  'building_part',
  'building',
  'premises',
  'structure',
  'street',
  ...TARGET_CONTEXTS.filter(
    kind =>
      !['building_part', 'building', 'premises', 'structure', 'street'].includes(kind),
  ),
] as (typeof TARGET_CONTEXTS)[number][]
const id = $props.id()
let namingEditorOpen = $state(false)
const namingEditorId = `${id}-naming-editor`
const namingTriggerId = `${id}-naming-trigger`
const inheritedNaming = $derived(
  inheritedNameRule ?? {
    base: type.relation === 'represents' ? ('location' as const) : ('feature' as const),
    conditions: [],
  },
)
/** Reveal the full-width editor beneath the current three columns.
 * @returns Completion after the editor is rendered and focused.
 */
async function openNamingEditor(): Promise<void> {
  const opening = !namingEditorOpen
  namingEditorOpen = true
  await tick()
  if (opening) {
    // Let the facet measure the newly mounted editor and publish its scroll clearance.
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await tick()
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
  const editor = document.getElementById(namingEditorId)
  const heading = document.getElementById(`${namingEditorId}-title`)
  if (!editor || !heading) return
  // Scroll only the owning viewport; scrollIntoView also moves clipping ancestors.
  let viewport = editor.parentElement
  while (viewport && !/^(auto|scroll)$/.test(getComputedStyle(viewport).overflowY))
    viewport = viewport.parentElement
  const clearance = Number.parseFloat(getComputedStyle(editor).scrollMarginTop) || 0
  const behavior = prefersReducedMotion.current ? 'instant' : 'smooth'
  const top = editor.getBoundingClientRect().top - clearance
  if (viewport) {
    viewport.scrollTo({
      top:
        viewport.scrollTop +
        top -
        viewport.getBoundingClientRect().top -
        viewport.clientTop,
      behavior,
    })
  } else {
    window.scrollTo({ top: window.scrollY + top, behavior })
  }
  heading.focus({ preventScroll: true })
}
/** Close an accepted or cancelled editor and restore focus to its summary.
 * @returns Completion after the summary trigger receives focus.
 */
async function closeNamingEditor(): Promise<void> {
  namingEditorOpen = false
  await tick()
  document.getElementById(namingTriggerId)?.focus({ preventScroll: true })
}
const targets = $derived(
  type.targetContexts ??
    TARGET_CONTEXTS.filter(kind => type.locationKinds.includes(kind)),
)
let identifierEdited = $state(false)
let automaticIdentifier = $state<string | null>(null)
/** Follow English names until the identifier has been explicitly customized.
 * @param before Previous English label. @param after New English label. @returns Nothing.
 */
function updateEnglishName(before: string, after: string): void {
  const code = (label: string): string =>
    propertyKeyFromLabel(label)
      .replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
      .slice(0, 80)
  if (
    identifierEdited ||
    (type.id !== automaticIdentifier &&
      type.id !== code(before) &&
      !(before === 'New feature type' && /^type-\d+$/.test(type.id)))
  )
    return
  const next = code(after)
  if (!next || next === type.id) return
  onIdChange?.(type.id, next)
  type.id = next
  automaticIdentifier = next
}
</script>

<div
  class="bits-theme grid min-w-0 items-start gap-6 px-6 pt-4 pb-6 lg:grid-cols-3"
  data-type-editor
>
  <section
    class="lg:border-border/50 grid min-w-0 content-start gap-3 lg:border-r lg:pr-6"
    aria-label="Type settings"
  >
    <FeatureTypeNames
      bind:type
      {locales}
      {reviewLocales}
      {reviewGroup}
      {multilingual}
      {disabled}
      onEnglishChange={updateEnglishName}
    />
    <TextInput
      label="Stable identifier"
      inputAttrs={{ 'aria-label': 'Stable identifier' }}
      required
      value={type.id}
      isEditing={!disabled}
      {...disabled ? typeReadOnlyInputAppearance : typeInputAppearance}
      onValueChange={value => {
        identifierEdited = true
        onIdChange?.(type.id, value)
        type.id = value
      }}
    />
    <FeaturePolicyChoice
      label="Feature kind"
      help="kind"
      value={type.kind ?? 'object'}
      {disabled}
      options={[
        { value: 'object', title: 'Object', description: 'An individual item' },
        { value: 'place', title: 'Place', description: 'A destination' },
        {
          value: 'area',
          title: 'Area',
          description: 'A wider space',
          forthcoming: true,
        },
        {
          value: 'route',
          title: 'Route',
          description: 'A path to follow',
          forthcoming: true,
        },
      ]}
      onChange={value => (type.kind = value as FeatureType['kind'])}
    />
    <div>
      <FeatureNamingPolicySettings
        {scopeType}
        expanded={namingEditorOpen}
        editorId={namingEditorId}
        triggerId={namingTriggerId}
        onConfigure={openNamingEditor}
        disabled={namingDisabled}
        override={namingOverride}
        onChange={rule => onNamingChange?.(rule)}
      />
    </div>
  </section>
  <section
    class="lg:border-border/50 grid min-w-0 content-start gap-4 lg:border-r lg:pr-6"
    aria-label="Location behavior"
  >
    <FeaturePolicyChoice
      label="Association relation"
      help="relation"
      value={type.relation ?? 'locatedAt'}
      {disabled}
      options={[
        {
          value: 'locatedAt',
          title: 'Located at',
          description: 'An item at a location',
        },
        {
          value: 'represents',
          title: 'Represents',
          description: 'The location itself',
        },
      ]}
      onChange={value => (type.relation = value as FeatureType['relation'])}
    />
    <FeaturePolicyChoice
      label="Suggested starting point"
      help="start"
      value={type.start}
      {disabled}
      options={[
        {
          value: 'search',
          title: 'Find a location',
          description: 'Match by search',
        },
        {
          value: 'pin',
          title: 'Place on the map',
          description: 'Start with a precise pin',
        },
      ]}
      onChange={value => (type.start = value as FeatureType['start'])}
    />
    <FeaturePolicyChoice
      label="When no location is found"
      help="missing"
      value={type.unresolvedMode ?? 'prompt'}
      {disabled}
      options={[
        {
          value: 'prompt',
          title: 'Offer local creation',
          description: 'List new place',
        },
        {
          value: 'silent',
          title: 'Continue silently',
          description: 'Keep it unlisted',
        },
      ]}
      onChange={value => (type.unresolvedMode = value as FeatureType['unresolvedMode'])}
    />
  </section>
  <section class="grid min-w-0 content-start gap-4" aria-label="Location targets">
    <Label text="Where can features be located?" />
    {#each LOCATION_ENTITY_KINDS.filter(family => family !== 'unknown') as family}
      <fieldset class="grid min-w-0 gap-1">
        <legend
          class="text-primary border-border/40 mb-2 w-full border-b pb-2 text-xs font-bold tracking-wider uppercase"
        >
          {locationTaxonomyLabel(family)}
        </legend>
        {#each orderedTargets.filter(
          kind =>
            locationTaxonomy(kind).kind === family &&
            kind !== 'infrastructure' &&
            (kind === 'address' ||
              locationTaxonomy(kind).class !== null ||
              targets.includes(kind)),
        ) as kind}
          <div class="flex min-h-9 min-w-0 items-center justify-between gap-3">
            <label class="min-w-0 text-sm font-normal" for={`${id}-${kind}`}>
              <span
                >{kind === 'structure'
                  ? 'Structure'
                  : kind === 'premises'
                    ? 'Premises'
                    : locationTaxonomyLabel(
                        locationTaxonomy(kind).class ?? locationTaxonomy(kind).kind,
                      )}</span
              >
              {#if examples[kind]}
                <span class="text-muted-foreground text-xs"> ({examples[kind]})</span>
              {/if}
            </label>
            <Switch
              id={`${id}-${kind}`}
              size="sm"
              {disabled}
              checked={targets.includes(kind)}
              onCheckedChange={checked =>
                (type.targetContexts = checked
                  ? [...targets, kind]
                  : targets.filter(value => value !== kind))}
            />
          </div>
        {/each}
      </fieldset>
    {/each}
  </section>
  {#if namingEditorOpen && !namingDisabled}
    <FeatureNamingRuleEditor
      id={namingEditorId}
      {scopeType}
      {scopeId}
      locales={namingLocales}
      inheritedRule={inheritedNaming}
      override={namingOverride}
      disabled={namingDisabled}
      onAccept={rule => {
        onNamingChange?.(rule)
        void closeNamingEditor()
      }}
      onCancel={() => void closeNamingEditor()}
    />
  {/if}
</div>
