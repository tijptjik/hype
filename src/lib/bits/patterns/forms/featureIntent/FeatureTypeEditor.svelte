<script lang="ts">
// UTILITIES
import { propertyKeyFromLabel } from '#lib/utils/nameIdentifier.js'
// COMPONENTS
import FeaturePolicyChoice from './FeaturePolicyChoice.svelte'
import { TextInput } from '#lib/bits/custom/form/index.js'
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import FeatureNamingSettings from './FeatureNamingSettings.svelte'
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
  multilingual,
  disabled = false,
  onIdChange,
}: {
  type: FeatureType
  scopeType: FeatureIntentScope['type']
  scopeId: string
  locales: string[]
  multilingual: boolean
  disabled?: boolean
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
      help="Objects are individual items, such as signs or drinking fountains. Places are destinations, such as shops or community venues. Area and Route support is forthcoming."
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
      help="Located at keeps the feature distinct from its host: a sign located at a building. Represents means the feature is the location itself: a bookstore representing that establishment. Choose Located at for objects; Represents for places."
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
      help="Find a location starts with a search for an existing place or address. Place on the map starts with a pin, with an optional location link afterward. Use search for known places and a pin for objects or places without an address."
      value={type.start}
      {disabled}
      options={[
        {
          value: 'search',
          title: 'Find a location',
          description: 'Search places and addresses',
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
      label="When no location is selected"
      help="Offer local creation asks the author whether to create a location when none is selected. Continue silently lets them proceed without that prompt. Offer creation for missing places; continue silently when a map position is enough."
      value={type.unresolvedMode ?? 'prompt'}
      {disabled}
      options={[
        {
          value: 'prompt',
          title: 'Offer local creation',
          description: 'Ask to add a missing place',
        },
        {
          value: 'silent',
          title: 'Continue silently',
          description: 'Proceed without a prompt',
        },
      ]}
      onChange={value => (type.unresolvedMode = value as FeatureType['unresolvedMode'])}
    />
    <div class="pt-4">
      <FeatureNamingSettings
        {scopeType}
        {scopeId}
        {locales}
        {disabled}
        rule={type.nameRule ?? {
          base: type.relation === 'represents' ? 'location' : 'feature',
          conditions: [],
        }}
        onChange={rule => (type.nameRule = rule)}
      />
    </div>
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
</div>
