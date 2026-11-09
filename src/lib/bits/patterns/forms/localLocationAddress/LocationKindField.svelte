<script lang="ts">
// I18N
import { m } from '#lib/i18n.js'
// COMPONENTS
import { SelectField } from '#lib/bits/custom/form/index.js'
// DOMAIN
import {
  LOCATION_KINDS,
  LocationKindSchema,
  type LocationKind,
} from '#lib/locations/kinds.js'
import { locationKindLabel } from '#lib/locations/kinds.i18n.js'
let {
  value,
  disabled = false,
  onChange,
}: {
  value: LocationKind
  disabled?: boolean
  onChange: (value: LocationKind) => void
} = $props()
const uid = $props.id()
const items = $derived(
  LOCATION_KINDS.map(value => ({ value, label: locationKindLabel(value) })),
)
</script>
<SelectField
  id={`${uid}-kind`}
  label={m.location_record_type()}
  placeholder={m.location_record_type()}
  {value}
  {items}
  {disabled}
  onValueChange={next => onChange(LocationKindSchema.parse(next))}
/>
