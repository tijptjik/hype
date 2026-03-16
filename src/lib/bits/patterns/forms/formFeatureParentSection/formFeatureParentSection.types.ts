import type { Snippet } from 'svelte'
import type {
  FormParentSectionHeaderContext,
  FormParentLayerSectionProps,
  FormParentProjectSectionProps,
  FormParentSectionProps,
} from '$lib/bits/patterns/forms/formParentSection'

export type FormFeatureParentSectionSharedProps = Pick<
  FormParentSectionProps,
  'isEditing' | 'isSubmitting' | 'isSubmitRequested'
>

export interface FormFeatureParentSectionProps {
  class?: string
  subHeader?: Snippet<[FormParentSectionHeaderContext]>
  sharedSectionProps?: FormFeatureParentSectionSharedProps
  isEditing?: boolean
  onClearAll?: () => void
  organisationSection: Omit<FormParentSectionProps, 'title' | 'subtitle' | 'class'>
  projectSection: Omit<FormParentProjectSectionProps, 'title' | 'subtitle' | 'class'>
  layerSection: Omit<FormParentLayerSectionProps, 'title' | 'subtitle' | 'class'>
}
