// TYPES
import type { FieldComponentType } from '#lib/client/services/fieldComponents.js'
import type { InputType, Key, Field } from '#lib/types.js'
import type { FieldDiscriminator as FieldDiscriminatorEnum } from '#lib/enums.js'

/* ----------------- */
// FORM FIELDS
/* -------- */

export type FormFieldDefinition = {
  label?: string
  placeholder?: string
  component?: FieldComponentType
  isArray: boolean
  isNested: boolean
  isTranslated: boolean
}

export type FormFieldExtendedDefinition = FormFieldDefinition & {
  values?: readonly string[]
  inputType?: InputType
  showForComponent?: FieldComponentType[]
}

type FormFieldNestedDefinition = FormFieldDefinition & {
  coreValues: string[]
  translatedValues: string[]
}

type FormFieldArrayDefinition = {
  isArray: true
  discriminators: {
    key: string
    values: readonly string[]
    specs: Record<
      Exclude<FieldDiscriminatorEnum, 'display'>,
      Record<Key, FormFieldExtendedDefinition>
    >
  }
}

export type FormField = Record<Field, FormFieldDefinition>

export type FormFieldArray = Record<Field, FormFieldArrayDefinition>

export type FormFieldNested = Record<Field, FormFieldNestedDefinition>
