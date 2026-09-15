// TYPES
import type {
  OrganisationForm,
  ProjectForm,
  LayerForm,
  FeatureForm,
  Form,
} from '$lib/client/services/form.types'
import type {
  Resource,
  FieldDiscriminator,
  LocaleExtended,
  Field,
  Id,
  Locale,
} from '$lib/types'
import type {
  FormField,
  FormFieldArray,
  FormFieldExtendedDefinition,
} from '$lib/client/services/formFields.types'
import type { IntermediateValue } from '$lib/client/services/propertyFilters.types'

/* ----------------- */
// SVELTE : PROPS
/* -------- */

type FormProps = OrganisationForm | ProjectForm | LayerForm | FeatureForm

type PageProps<T extends Resource> = {
  data: {
    [key: string]: T
  }
}

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

type UserFieldProps = SectionProps & {
  fieldRoot: Field
  joinConfig: {
    discriminator: string // e.g. 'role'
    uncheckedValue: string // e.g. 'member'
    checkedValue: string // e.g. 'owner'
  }
  searchMode: boolean
  removeMode: boolean
}

type FieldPropsExtended = FieldProps & ExtendedParams

type ListFieldProps = FieldPropsExtended & {
  values: IntermediateValue[]
  actions: {
    add: (e: Event) => void
    remove: (e: Event, valueId: Id) => void
    update: (e: Event, valueId: Id, locale: Locale) => void
    syncUp: () => void
  }
  actionProps: {
    dragMode: boolean
    removeMode: boolean
    removeModeLocale?: string
    confirmingId?: string
  }
}
