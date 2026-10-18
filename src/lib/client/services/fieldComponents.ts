// TYPES

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

export type FieldComponentType = (typeof fieldComponentTypes)[number]
