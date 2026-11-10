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
import { shortLocaleLabel } from '#lib/bits/custom/localeControls/localeControls.js'
import { typeInputAppearance, typeSelectAppearance } from './featureTypeEditor.styles'
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
const id = $props.id()
const targets = $derived(
  type.targetContexts ??
    TARGET_CONTEXTS.filter(kind => type.locationKinds.includes(kind)),
)
/** Edit a translated name while retaining the legacy base-label fallback.
 * @param locale Canonical language. @param value Authored label. @returns Nothing.
 */
function updateLabel(locale: string, value: string): void {
  type.labels = { ...type.labels, [locale]: value }
  if (locale === 'en') type.label = value
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
    <TextInput
      label="Stable identifier"
      inputAttrs={{ 'aria-label': 'Stable identifier' }}
      required
      value={type.id}
      isEditing={!disabled}
      {...typeInputAppearance}
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
    <div class="grid min-w-0 gap-3">
      {#each locales as locale}
        <TextInput
          label={multilingual
            ? `Display name ${shortLocaleLabel(locale)}`
            : 'Display name'}
          value={type.labels?.[locale] ?? (locale === 'en' ? type.label : '')}
          isEditing={!disabled}
          {...typeInputAppearance}
          inputAttrs={{
            'aria-label': multilingual ? `Display name ${locale}` : 'Display name',
            lang: locale,
            dir: 'auto',
            maxlength: 80,
          }}
          onValueChange={value => updateLabel(locale, value)}
        />
      {/each}
    </div>
    <div class="border-border/40 border-t pt-4">
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
        <legend class="text-muted-foreground mb-2 text-xs font-semibold">
          {locationTaxonomyLabel(family)}
        </legend>
        {#each TARGET_CONTEXTS.filter(
          kind =>
            locationTaxonomy(kind).kind === family &&
            kind !== 'infrastructure' &&
            (locationTaxonomy(kind).class !== null || targets.includes(kind)),
        ) as kind}
          <div class="flex min-h-9 min-w-0 items-center justify-between gap-3">
            <Label
              for={`${id}-${kind}`}
              text={locationTaxonomy(kind).class === null
                ? `${locationTaxonomyLabel(family)} (any class)`
                : locationTaxonomyLabel(locationTaxonomy(kind).class ?? 'unknown')}
            />
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
