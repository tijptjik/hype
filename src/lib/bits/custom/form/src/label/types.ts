export type FormIssueValue =
  | Array<{ message: string; path?: Array<string | number> }>
  | null
  | undefined

export interface FormLabelProps {
  for?: string
  text?: string
  required?: boolean
  isEditing?: boolean
  issues?: FormIssueValue
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
  isEditing?: boolean
  requiredSymbol?: string
  class?: string
}

export interface FormLabelIssuesProps {
  issues?: FormIssueValue
  class?: string
}
