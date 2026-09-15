// TYPES
import type { CapabilityKey } from '$lib/capabilities.types'

/* ----------------- */
// FORMS
/* -------- */

export type LayerForm = unknown

export type OrganisationForm = unknown

export type ProjectForm = unknown

export type FeatureForm = unknown

type HubForm = unknown

export type Form = LayerForm | OrganisationForm | ProjectForm | FeatureForm | HubForm

export type CollectionNavOptions = {
  openCard?: boolean
  openCardDelay?: number
  isCardOpen?: boolean
  focus?: boolean
  focusFeature?: boolean
  highlight?: boolean
  navOptions?: {
    paramsToDrop?: string[]
    paramsToAdd?: Record<string, string>
  }
}

export type FormIssueLike = {
  message: string
  path?: Array<string | number>
}

export type UserRoleFieldNameResolverForm = {
  fields: {
    value: () => {
      data?: {
        userRoles?: Array<{ userId: string }>
      }
    }
    data?: {
      userRoles?: Array<{
        role?: { as: (type: 'select') => { name?: string } }
        userId?: { as: (type: 'hidden', value: string) => Record<string, unknown> }
        capabilities?: Partial<
          Record<
            CapabilityKey,
            { as: (type: 'hidden', value: string) => Record<string, unknown> }
          >
        >
      }>
    }
  }
}

export type HubOrganisationFieldNameResolverForm = {
  fields: {
    value: () => {
      data?: {
        organisations?: Array<{
          organisationId: string
          isCoreInclusive: boolean
          isHubExclusive: boolean
        }>
      }
    }
    data?: {
      organisations?: Array<{
        organisationId?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        isCoreInclusive?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
        isHubExclusive?: {
          as: (type: 'hidden', value: string) => Record<string, unknown>
        }
      }>
    }
  }
}

export type GenAiField =
  | 'title'
  | 'name'
  | 'nameShort'
  | 'description'
  | 'subscriptionBenefits'
  | 'privacyPolicy'
  | 'termsOfService'

export type FormBooleanValue = boolean | 'true' | 'false'

export type FormDataUpdaterForm<T> = {
  fields: {
    value: () => {
      data?: T
    }
    set: (value: T) => void
  }
}
