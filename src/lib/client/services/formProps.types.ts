// TYPES
import type { Form } from '#lib/client/services/form.types.js'
import type { FieldDiscriminator, LocaleExtended, Field } from '#lib/types.js'
import type {
  FormField,
  FormFieldArray,
  FormFieldExtendedDefinition,
} from '#lib/client/services/formFields.types.js'

/* ----------------- */
// SVELTE : PROPS
/* -------- */

export type SectionProps = {
  form: Form
  fields: FormField | FormFieldArray
  fieldDiscriminator?: FieldDiscriminator
  title?: string
  subtitle?: string
  cols?: number
}

type ExtendedParams = {
  locale?: LocaleExtended
  field: FormFieldExtendedDefinition
  fieldRoot: Field
  fieldIndex: number
  fieldKey: Field | 'value'
}

// FIELDS

export type FieldProps = SectionProps &
  ExtendedParams & {
    values?: string[]
    actions?: Record<string, (...args: never[]) => void>
  }
