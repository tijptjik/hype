<script lang="ts">
// COMPONENTS
import { TextInput, SelectField } from '#lib/bits/custom/form/index.js'
import Label from '#lib/bits/custom/form/src/label/Label.svelte'
import Switch from '#lib/bits/custom/switch/Switch.svelte'
import FeatureNamingSettings from './FeatureNamingSettings.svelte'
// DOMAIN
import { FEATURE_KINDS, TARGET_CONTEXTS } from '#lib/features/locationPolicy.js'
import { LOCATION_ENTITY_KINDS, locationTaxonomy } from '#lib/locations/taxonomy.js'
import { locationTaxonomyLabel } from '#lib/locations/taxonomy.i18n.js'
import FeatureTypeNames from './FeatureTypeNames.svelte'
import {
  typeInputAppearance,
  typeReadOnlyInputAppearance,
  typeSelectAppearance,
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
}: {
  type: FeatureType
  scopeType: FeatureIntentScope['type']
  scopeId: string
  locales: string[]
  multilingual: boolean
  disabled?: boolean
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
</script>

<div
  class="bits-theme grid min-w-0 items-start gap-6 px-6 pt-4 pb-6 lg:grid-cols-3"
  data-type-editor
>
  <section
    class="lg:border-border/50 grid min-w-0 content-start gap-3 lg:border-r lg:pr-6"
    aria-label="Type settings"
  >
    <TextInput
      label="Stable identifier"
      inputAttrs={{ 'aria-label': 'Stable identifier' }}
      required
      value={type.id}
      isEditing={!disabled}
      {...disabled ? typeReadOnlyInputAppearance : typeInputAppearance}
      onValueChange={value => (type.id = value)}
    />
    <SelectField
      label="Feature kind"
      triggerAttrs={{ 'aria-label': 'Feature kind' }}
      value={type.kind ?? 'object'}
      isEditing={!disabled}
      {...typeSelectAppearance}
      items={FEATURE_KINDS.map(value => ({
        value,
        label: value.charAt(0).toUpperCase() + value.slice(1),
      }))}
      onValueChange={value => (type.kind = value as FeatureType['kind'])}
    />
    <SelectField
      label="Association relation"
      triggerAttrs={{ 'aria-label': 'Association relation' }}
      value={type.relation ?? 'locatedAt'}
      isEditing={!disabled}
      {...typeSelectAppearance}
      items={[
        { value: 'locatedAt', label: 'Located at' },
        { value: 'represents', label: 'Represents' },
      ]}
      onValueChange={value => (type.relation = value as FeatureType['relation'])}
    />
    <SelectField
      label="Suggested starting point"
      triggerAttrs={{ 'aria-label': 'Suggested starting point' }}
      value={type.start}
      isEditing={!disabled}
      {...typeSelectAppearance}
      items={[
        { value: 'search', label: 'Find a location' },
        { value: 'pin', label: 'Place on the map' },
      ]}
      onValueChange={value => (type.start = value as FeatureType['start'])}
    />
    <SelectField
      label="When no location is selected"
      triggerAttrs={{ 'aria-label': 'When no location is selected' }}
      value={type.unresolvedMode ?? 'prompt'}
      isEditing={!disabled}
      {...typeSelectAppearance}
      items={[
        { value: 'prompt', label: 'Offer local creation' },
        { value: 'silent', label: 'Continue silently' },
      ]}
      onValueChange={value =>
        (type.unresolvedMode = value as FeatureType['unresolvedMode'])}
    />
  </section>
  <section
    class="lg:border-border/50 grid min-w-0 content-start gap-4 lg:border-r lg:pr-6"
    aria-label="Type names"
  >
    <FeatureTypeNames bind:type {locales} {multilingual} {disabled} />
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
