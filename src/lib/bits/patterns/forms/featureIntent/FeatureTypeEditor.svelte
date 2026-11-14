<script lang="ts">
// SVELTE
import { tick } from 'svelte'
// I18N
import { m } from '#lib/i18n.js'
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
import { DEFAULT_FEATURE_TYPES } from '#lib/features/intents.js'
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
const examples: Record<string, string> = $derived({
  building_part: m.feature_model_building_part_examples(),
  premises: m.feature_model_premises_examples(),
  structure: m.feature_model_structure_examples(),
  street: m.feature_model_street_example(),
})
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
/** Open the focused naming dialog without expanding or scrolling the parent form.
 * @returns Nothing; the dialog manages initial focus.
 */
function openNamingEditor(): void {
  namingEditorOpen = true
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
/** Apply the selected kind's starting behavior to the editable definition.
 * @param kind Newly selected feature kind.
 * @returns Nothing.
 * @remarks Runs only on selection; loading existing settings preserves overrides.
 */
function updateKind(kind: string): void {
  const defaults = DEFAULT_FEATURE_TYPES.find(candidate => candidate.kind === kind)
  if (!defaults) return
  type.kind = defaults.kind
  type.relation = defaults.relation
  type.start = defaults.start
  type.unresolvedMode = defaults.unresolvedMode
}
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
    aria-label={m.feature_model_type_settings()}
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
      label={m.feature_model_identifier()}
      inputAttrs={{ 'aria-label': m.feature_model_identifier() }}
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
      label={m.setup_feature_kind()}
      help="kind"
      value={type.kind ?? 'object'}
      {disabled}
      options={[
        {
          value: 'object',
          title: m.feature_model_object(),
          description: m.feature_model_item_description(),
        },
        {
          value: 'place',
          title: m.feature_model_place(),
          description: m.feature_model_destination_description(),
        },
        {
          value: 'area',
          title: m.address_division_area(),
          description: m.feature_model_area_description(),
          forthcoming: true,
        },
        {
          value: 'route',
          title: m.feature_model_route(),
          description: m.feature_model_route_description(),
          forthcoming: true,
        },
      ]}
      onChange={updateKind}
    />
    <div>
      <FeatureNamingPolicySettings
        {scopeId}
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
    aria-label={m.feature_model_location_behavior()}
  >
    <FeaturePolicyChoice
      label={m.feature_model_relation()}
      help="relation"
      value={type.relation ?? 'locatedAt'}
      {disabled}
      options={[
        {
          value: 'locatedAt',
          title: m.feature_model_located_at(),
          description: m.feature_model_host_description(),
        },
        {
          value: 'represents',
          title: m.feature_model_represents(),
          description: m.feature_model_represents_description(),
        },
      ]}
      onChange={value => (type.relation = value as FeatureType['relation'])}
    />
    <FeaturePolicyChoice
      label={m.feature_model_starting_point()}
      help="start"
      value={type.start}
      {disabled}
      options={[
        {
          value: 'search',
          title: m.feature_model_find_location(),
          description: m.feature_model_search_description(),
        },
        {
          value: 'pin',
          title: m.feature_model_place_on_map(),
          description: m.feature_model_pin_description(),
        },
      ]}
      onChange={value => (type.start = value as FeatureType['start'])}
    />
    <FeaturePolicyChoice
      label={m.feature_model_missing_location()}
      help="missing"
      value={type.unresolvedMode ?? 'prompt'}
      {disabled}
      options={[
        {
          value: 'prompt',
          title: m.feature_model_offer_creation(),
          description: m.feature_model_list_place(),
        },
        {
          value: 'silent',
          title: m.feature_model_continue_silently(),
          description: m.feature_model_keep_unlisted(),
        },
      ]}
      onChange={value => (type.unresolvedMode = value as FeatureType['unresolvedMode'])}
    />
  </section>
  <section
    class="grid min-w-0 content-start gap-4"
    aria-label={m.feature_model_location_targets()}
  >
    <Label text={m.feature_model_allowed_locations()} />
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
                  ? m.feature_model_structure()
                  : kind === 'premises'
                    ? m.feature_model_premises()
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
      featureType={type.id}
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
