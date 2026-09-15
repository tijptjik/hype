// TYPES
type FieldComponentCtor = abstract new (...args: never[]) => unknown

const fieldComponentTypes = [
  'InputField',
  'SelectField',
  'RangeField',
  'TextareaField',
  'UsersField',
  'CustomField',
  'ListField',
  'ToggleField',
  'DisplayField',
] as const

export const classifierComponentTypes = ['SelectField', 'RangeField'] as const

export const specifierComponentTypes = ['InputField', 'TextareaField'] as const

const displayComponentTypes = ['InputField'] as const

export type FieldComponentType = (typeof fieldComponentTypes)[number]

type FieldComponent = FieldComponentCtor
