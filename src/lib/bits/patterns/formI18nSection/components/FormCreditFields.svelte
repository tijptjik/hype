<script lang="ts">
import { m } from '$lib/i18n'
import { TextInput } from '$lib/bits/custom/form'
import type { Locale } from '$lib/types'
import type { FormIssueValue } from '$lib/bits/custom/form/src/label/types'

type BooleanField = {
  value: () => boolean | 'true' | 'false' | undefined
  as: (type: 'hidden', value: string) => Record<string, unknown>
}

type TextField = {
  as: (type: 'text') => Record<string, unknown>
  issues: () => FormIssueValue
}

type CreditLocaleFields = {
  license: TextField
  licenseGen: BooleanField
  attribution: TextField
  attributionGen: BooleanField
}

let {
  fields,
  formLocale,
  locale,
  isEditing = false,
  isRequiredInPreflight,
}: {
  fields: CreditLocaleFields
  formLocale: string
  locale: Locale
  isEditing?: boolean
  isRequiredInPreflight: (path: Array<string | number>) => boolean
} = $props()

const licenseField = $derived(fields.license)
const licenseAttrs = $derived(licenseField.as('text'))
const licenseRequired = $derived(
  isRequiredInPreflight(['data', 'i18n', formLocale, 'license']),
)
const licenseIssues = $derived(licenseField.issues())
const licenseGenValue = $derived(fields.licenseGen.value())
const licenseGenAttrs = $derived(
  fields.licenseGen.as('hidden', licenseGenValue ? 'true' : 'false'),
)

const attributionField = $derived(fields.attribution)
const attributionAttrs = $derived(attributionField.as('text'))
const attributionRequired = $derived(
  isRequiredInPreflight(['data', 'i18n', formLocale, 'attribution']),
)
const attributionIssues = $derived(attributionField.issues())
const attributionGenValue = $derived(fields.attributionGen.value())
const attributionGenAttrs = $derived(
  fields.attributionGen.as('hidden', attributionGenValue ? 'true' : 'false'),
)
</script>

<input {...licenseGenAttrs}>
<input {...attributionGenAttrs}>

<TextInput
  label={m.admin__forms_projects_license()}
  {locale}
  isTranslated={true}
  required={licenseRequired}
  {isEditing}
  value={(licenseAttrs as { value?: string }).value ?? ''}
  issues={licenseIssues}
  inputAttrs={licenseAttrs as Record<string, unknown>}
/>

<TextInput
  label={m.profile__attribution()}
  {locale}
  isTranslated={true}
  required={attributionRequired}
  {isEditing}
  value={(attributionAttrs as { value?: string }).value ?? ''}
  issues={attributionIssues}
  inputAttrs={attributionAttrs as Record<string, unknown>}
/>
