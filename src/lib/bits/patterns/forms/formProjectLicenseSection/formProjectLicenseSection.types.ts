import type { ProjectLicense } from '#lib/db/zod/schema/projectLicense.types.js'
import type { ProjectLicenseIntent } from '#lib/client/services/licence.js'

export type FormProjectLicenseLeafMediaType = 'image' | 'text' | 'data'

export interface FormProjectLicenseChoiceCard {
  key: ProjectLicenseIntent
  title: string
  description: string
}

export interface FormProjectLicenseRightRow {
  key: 'BY' | 'SA' | 'NC' | 'ND'
  label: string
  description: string
}

export interface FormProjectLicenseCustomLabels {
  text: string
  image: string
  data: string
}

export interface FormProjectLicenseSectionProps {
  title: string
  subtitle: string
  attributionPlaceholder?: string
  attributionHint?: string
  license: ProjectLicense
  choiceCards: FormProjectLicenseChoiceCard[]
  rightRows: FormProjectLicenseRightRow[]
  leafMediaTypes: FormProjectLicenseLeafMediaType[]
  useCustomLicenseLabels: boolean
  customLicenseLabels: FormProjectLicenseCustomLabels
  isEditing?: boolean
  isSubmitting?: boolean
  class?: string
  onApplyLicense: (params: {
    license: ProjectLicense
    useCustomLicenseLabels: boolean
    customLicenseLabels: FormProjectLicenseCustomLabels
  }) => void
}
