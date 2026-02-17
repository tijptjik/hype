export type FormErrorValue = string | string[] | null | undefined

export interface FormLabelProps {
  for?: string
  text?: string
  required?: boolean
  error?: FormErrorValue
  class?: string
  textClass?: string
  requiredClass?: string
  errorClass?: string
}

export interface FormLabelTextProps {
  for?: string
  text?: string
  class?: string
}

export interface FormLabelRequiredProps {
  required?: boolean
  requiredSymbol?: string
  class?: string
}

export interface FormLabelErrorProps {
  error?: FormErrorValue
  class?: string
}
