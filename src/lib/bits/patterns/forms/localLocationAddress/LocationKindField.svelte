<script lang="ts">
// TAXONOMY
import {
  LOCATION_ENTITY_KINDS,
  locationTaxonomy,
  expandLocationMatchingTypes,
} from '#lib/locations/taxonomy.js'
import { locationTaxonomyLabel } from '#lib/locations/taxonomy.i18n.js'
// COMPONENTS
import { SelectField } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  LOCATION_KINDS,
  LocationKindSchema,
  type LocationKind,
} from '#lib/locations/kinds.js'
let {
  value,
  disabled = false,
  allowPartCreation = false,
  allowedKinds,
  onChange,
}: {
  value: LocationKind
  disabled?: boolean
  allowPartCreation?: boolean
  allowedKinds?: readonly string[]
  onChange: (value: LocationKind) => void
} = $props()
const uid = $props.id()
const taxonomy = $derived(locationTaxonomy(value))
const available = $derived(
  LOCATION_KINDS.filter(
    type =>
      type !== 'infrastructure' &&
      (type !== 'building_part' || allowPartCreation || value === 'building_part') &&
      (!allowedKinds || expandLocationMatchingTypes(allowedKinds).includes(type)),
  ),
)
const families = $derived(
  LOCATION_ENTITY_KINDS.filter(kind =>
    available.some(type => locationTaxonomy(type).kind === kind),
  ).map(value => ({ value, label: locationTaxonomyLabel(value) })),
)
const classes = $derived(
  available
    .filter(type => locationTaxonomy(type).kind === taxonomy.kind)
    .map(type => ({
      value: type,
      label: locationTaxonomyLabel(locationTaxonomy(type).class ?? 'unknown'),
    })),
)
</script>
<SelectField
  triggerClass="bg-transparent! hover:bg-transparent! shadow-none!"
  id={`${uid}-kind`}
  label={locationTaxonomyLabel('kind')}
  value={taxonomy.kind}
  items={families}
  disabled={disabled || (value === 'building_part' && !allowPartCreation)}
  onValueChange={next => {
    const type =
      available.find(
        type =>
          locationTaxonomy(type).kind === next && locationTaxonomy(type).class === null,
      ) ?? available.find(type => locationTaxonomy(type).kind === next)
    if (type) onChange(type)
  }}
/>
{#if taxonomy.kind === 'built' ||
  taxonomy.kind === 'geographic' ||
  taxonomy.kind === 'operational'}
  <SelectField
    triggerClass="bg-transparent! hover:bg-transparent! shadow-none!"
    id={`${uid}-class`}
    label={locationTaxonomyLabel('class')}
    value={value === 'infrastructure' ? 'built' : value}
    items={classes}
    disabled={disabled || (value === 'building_part' && !allowPartCreation)}
    onValueChange={next => onChange(LocationKindSchema.parse(next))}
  />
{/if}
