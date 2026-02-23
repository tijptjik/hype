import type { ImageContextEnvelope } from '$lib/types'

export interface HubOrganisationItem {
  id: string
  code: string
  i18n?: {
    en?: {
      name?: string
    }
  } | null
  image?: ImageContextEnvelope | null
  isCoreInclusive?: boolean | null
  isHubExclusive?: boolean | null
}

export interface HubOrganisationSelection {
  organisationId: string
  isCoreInclusive: boolean
  isHubExclusive: boolean
}

export interface FormOrganisationsSectionProps {
  title: string
  subtitle?: string
  organisations: HubOrganisationItem[]
  selections: HubOrganisationSelection[]
  isEditing?: boolean
  isSubmitting?: boolean
  isSubmitRequested?: boolean
  startInAddingMode?: boolean
  canSetCoreInclusive?: boolean
  onSearchOrganisations: (query: string) => Promise<HubOrganisationItem[]>
  onAddOrganisation: (organisation: HubOrganisationItem) => void
  onRemoveOrganisation: (organisationId: string) => void
  onToggleCoreInclusive: (organisationId: string, nextValue: boolean) => void
  onToggleHubExclusive: (organisationId: string, nextValue: boolean) => void
  class?: string
}

export interface FormOrganisationsSectionActionsProps {
  isAdding: boolean
  isRemoving: boolean
  isEditing?: boolean
  isSubmitting?: boolean
  canRemove?: boolean
  onToggleAdding: () => void
  onToggleRemoving: () => void
}
