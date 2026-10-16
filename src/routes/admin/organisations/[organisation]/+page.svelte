<script lang="ts">
import type { RemoteForm, RemoteFormInput } from '$app/server'

// SVELTE
import { page } from '$app/state'

import { untrack } from 'svelte'
import type { StandardSchemaV1 } from '@standard-schema/spec'

// I18N
import { m } from '#lib/i18n.js'
import {
  getLocale,
  getLocaleKey,
  getLocaleOrder,
  toLocaleKey,
  translateText,
} from '#lib/i18n.js'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import { translateCapabilityLabels } from '#lib/client/services/capabilityTranslation.js'
import {
  addUserRoleSelection,
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getEditorCtrl,
  getUserRoleHiddenInputAttrs,
  getRoleFieldNameByUserId,
  guardRefDesync,
  guardUserRolesDesync,
  revalidateAfterSubmitAttempt,
  resetLocaleFields,
  removeUserRoleSelection,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
} from '#lib/client/services/form.js'
import { getNameForToast } from '#lib/client/services/resource.js'
import {
  getOrganisationSubmitUpdates,
  overrideOrganisationEntityBoolean,
  overrideOrganisationListItemBoolean,
  toOrganisationFormInput,
} from '#lib/client/services/organisation.js'
import {
  addProjectPropertyForType,
  addProjectPropertyValue,
  changeProjectPropertyRankUnified,
  getCurrentProjectProperties,
  getProjectPropertyFieldsForIndex,
  getPropertyFormIssues,
  removeProjectProperty,
  removeProjectPropertyValue,
  reorderProjectPropertyValue,
  resetProjectPropertyLocale,
  stopEvent,
  sortProjectPropertyValuesAlphabetically,
  translateProjectPropertyLocale,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  updateProjectPropertyValue,
  updateProjectPropertyValueI18n,
} from '#lib/client/services/property.js'
// CONTEXT
import { getAdminCtx } from '#lib/context/admin.svelte.js'
import { getHeaderCtrl } from '#lib/context/header.svelte.js'
// REMOTE
import {
  archiveOrganisation,
  getOrganisation,
  getOrganisations,
  organisationForm,
  publishOrganisation,
} from '#lib/api/organisation.remote.js'
import {
  toOrganisationAuthActor,
  resolveOrganisationActionPermissions,
} from '#lib/api/services/authz/index.js'
// SCHEMA
import {
  OrganisationPreflightFormData,
  OrganisationAdminProfileAPI,
} from '#lib/db/zod/schema/organisation.js'
import {
  CAPABILITY_I18N_BY_KEY,
  CAPABILITY_KEYS,
  getCapabilityLabel,
} from '#lib/capabilities.js'
// CONFIG
import { NEW_REF, NEW_TITLE } from '#lib/constants.js'
// BITS COMPONENTS
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import {
  FormSectionSkeleton,
  FormProfileSkeleton,
} from '#lib/bits/patterns/forms/formSkeleton/index.js'
import {
  FormI18nDescriptorFields,
  FormI18nSection,
  FormFieldsSection,
  OrganisationCapabilities,
  FormSpecifiersFields,
  FormUserRolesSection,
  Main,
  ResourceViewer,
} from '#lib/bits/index.js'
import { SectionHeader, SectionHeaderPrimitive } from '#lib/bits/custom/form/index.js'
// ADAPTERS
import { useImageProviderModel } from '#lib/adapters/image/index.js'
// CLIENT SERVICES
import { setOrganisationImagePresentationMode } from '#lib/client/services/image.js'
// FACTORIES
import { configureForm } from '#lib/factories.svelte.js'
// COMPONENTS
import ImageProvider from '#lib/providers/ImageProvider.svelte'
// NAVIGATION
import {
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
  navigateOnAdmin,
} from '#lib/navigation/index.js'
import type { OrganisationFacet } from '#lib/navigation/index.js'
// UTILS
import { createSchemaRequiredInferer, toIssueMessages } from '#lib/utils/form-schema.js'
// ICONS
import Blend from 'virtual:icons/proicons/shape-intersect'
import ImageIcon from 'virtual:icons/proicons/photo'
import ShieldIcon from 'virtual:icons/proicons/shield-checkmark'
import { resourceTabsStyles } from '#lib/bits/patterns/forms/formSurface/resourceTabs.styles.js'
import OrganisationIcon from 'virtual:icons/proicons/person-multiple'
import Type from 'virtual:icons/proicons/text'
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  OrganisationRoleType,
} from '#lib/enums.js'
import {
  classifierComponentTypes,
  specifierComponentTypes,
} from '#lib/client/services/fieldComponents.js'
// TYPES
import type { Locale, Id } from '#lib/types.js'

import type { User } from '#lib/db/zod/schema/user.types.js'
import type {
  UserRoleFieldNameResolverForm,
  FormDataUpdaterForm,
} from '#lib/client/services/form.types.js'
import type { CapabilityDefinitions, CapabilityKey } from '#lib/capabilities.types.js'
import type { HeaderTransitionSnapshot } from '#lib/client/services/formHeader.types.js'
import type { ImageCtxEnvelope } from '#lib/db/zod/schema/image.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'

import type {
  OrganisationBooleanField,
  OrganisationDB,
  OrganisationGetState,
  OrganisationRoleUser,
} from '#lib/db/zod/schema/organisation.types.js'

import type { CapabilityFormFields, CapabilitySearchOption } from '#lib/bits/index.js'

// § Context
const adminCtx = getAdminCtx()

const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = getAdminFacetTabsForResource(FirstClassResource.organisation)

const editorCtrl = getEditorCtrl({
  headerCtrl,
  icon: OrganisationIcon,
  facetTabs,
})

// § Config - Derived
const organisationRef = $derived(page.params.organisation as string)

const locales = $derived(getLocaleOrder(getLocaleKey()))
const currentLocaleKey = $derived(getLocaleKey())
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)

// A compact list row cannot initialize an administration editor.
const cachedOrganisationForRef = $derived.by(() => {
  const cached = adminCtx.appCtx.getResourceByRefSync(
    FirstClassResource.organisation,
    organisationRef,
  )

  if (!cached || !('capabilities' in cached) || !('userRoles' in cached))
    return undefined

  const parsed = OrganisationAdminProfileAPI.safeParse(cached)

  return parsed.success ? parsed.data : undefined
})

const cachedOrganisationState = $derived(
  cachedOrganisationForRef
    ? ({ data: cachedOrganisationForRef } as OrganisationGetState)
    : null,
)

// § State - Elements
let contentsElement: HTMLFormElement | undefined = $state()

let lastSyncedFacetHash = $state('')

// § State - State
let lastHeaderKey = $state('')

let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let fieldsLayoutMutationVersion = $state(0)
let capabilityResetVersion = $state(0)
let selectedUsersById = $state<Record<string, User>>({})
let hasAutoEnteredEditForNew = $state(false)
let settledOrganisationRef = $state<string | null>(null)
let completedOrganisationLoadRef = $state<string | null>(null)

let optimisticHeaderState = $state<HeaderTransitionSnapshot>({
  canEdit: true,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  isPublished: false,
  isDeleted: false,
  facets: [],
})

// § State - Data
let organisation: OrganisationGetState = $state(null)

let committedOrganisation: OrganisationGetState = $state(null)

const commitOrganisationState = (value: OrganisationGetState): void => {
  committedOrganisation = value
  organisation = value
}

const commitSettledOrganisationState = (value: OrganisationGetState): void => {
  commitOrganisationState(value)
  settledOrganisationRef = value?.data?.code ?? null
}

// § Derived State - Flags
const isCoreFacet = $derived(activeFacet === 'core')

const isCapabilitiesFacet = $derived(activeFacet === 'capabilities')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewOrganisationRef = $derived(organisationRef === NEW_REF)

// § Desync Guard

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewOrganisationRef) return true

  return guardRefDesync(organisation, committedOrganisation, organisationRef)
})

const isCurrentRefSettled = $derived(
  isNewOrganisationRef || settledOrganisationRef === organisationRef,
)
const optimisticOrganisationData = $derived.by(() =>
  isCurrentRefLoaded ? organisation?.data : cachedOrganisationForRef,
)

// § Form
const translatableI18nFields = ['name', 'nameShort', 'description'] as const

type OrganisationEditorFormInput = ReturnType<typeof toOrganisationFormInput>
type OrganisationRemoteFormInput = RemoteFormInput & OrganisationEditorFormInput

const configuredOrganisationForm = configureForm<OrganisationRemoteFormInput>(() => ({
  form: organisationForm as unknown as RemoteForm<
    OrganisationRemoteFormInput,
    { data: { id: string; modifiedAt: string } }
  >,
  ...createResourceFormConfig<OrganisationRemoteFormInput>({
    formEl: contentsElement,
    key: organisationRef,
    schema: OrganisationPreflightFormData as unknown as StandardSchemaV1<
      OrganisationRemoteFormInput,
      unknown
    >,
    // Keep form source anchored to the committed entity snapshot so
    // optimistic view-only entity tweaks (e.g. role UI rows) cannot
    // rehydrate stale i18n values back into the live form.
    data: toOrganisationFormInput(
      committedOrganisation?.data,
    ) as OrganisationRemoteFormInput,
    submitUpdates: async ({ data }) =>
      getOrganisationSubmitUpdates({
        data,
        locale: getLocale(),
        organisationId: organisation?.data?.id,
        entityQuery: getOrganisation({
          ref: organisationRef,
          refKey: 'code',
          meta: { isAdminRequest: true, profile: 'admin' },
        }),
        listQuery: getOrganisations({
          conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
          prisms: adminCtx.appCtx.state.prisms,
          meta: { isAdminRequest: true, profile: 'card' },
        }),
      }),
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.organisation,
    getEntity: () => organisation,
    refreshResource: async ({ data, shouldRedirect }) => {
      const submittedCode = data.data?.code?.trim() ?? ''
      const refreshed = await refreshOrganisation(
        shouldRedirect ? submittedCode : undefined,
      )

      commitSettledOrganisationState(refreshed)
    },
  }),
}))

const formCtx = $derived(configuredOrganisationForm())
const isRequiredInPreflight = createSchemaRequiredInferer(OrganisationPreflightFormData)
const isDirty = $derived(Boolean(formCtx.dirty))

// ISSUES
const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

const formLevelIssues = $derived.by((): string[] => {
  return toFormLevelIssueMessages(visibleAllIssues)
})
const userRoleSectionIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false

      const path = (issue as { path?: unknown }).path

      return Array.isArray(path) && path[0] === 'data' && path[1] === 'userRoles'
    })
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))

  return Array.from(new Set(messages))
})

const capabilityIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false

      const path = (issue as { path?: unknown }).path

      return Array.isArray(path) && path[0] === 'data' && path[1] === 'capabilities'
    })
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))

  return Array.from(new Set(messages))
})

const facetIssueState = $derived.by(() =>
  resolveFacetTabsWithIssues({
    issues: visibleAllIssues,
    facets: resolvedFacetTabs,
    formEl: contentsElement,
  }),
)

const facetIssueSummary = $derived(facetIssueState.facetIssueSummary)
const resolvedFacetTabsWithIssues = $derived(facetIssueState.facetTabsWithIssues)
const organisationPropertyFormAdapter = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{ properties?: Property[] }>,
)
let fieldRemoveMode = $state(false)

function createPropertyActions(getCount: () => number) {
  return {
    add: (event: Event): void => {
      stopEvent(event)
      if (!headerCtrl.state.isEditing && canSubmitOrganisation) {
        headerCtrl.setEditing(true)
      }
      addProjectPropertyForType(
        organisationPropertyFormAdapter,
        'classifier',
        '',
        classifierComponentTypes,
        specifierComponentTypes,
        {
          projectId: null,
          organisationId: organisation?.data?.id ?? null,
          hubId: null,
          scope: 'organisation',
          isDefaultEnabled: false,
        },
      )

      revalidateAfterProgrammaticChange()
    },

    remove: (event: Event, propertyId: Id): void => {
      stopEvent(event)
      removeProjectProperty(organisationPropertyFormAdapter, propertyId)
      if (getCount() <= 1) fieldRemoveMode = false
      revalidateAfterProgrammaticChange()
    },
    increaseRank: (event: Event, propertyId: Id): void => {
      stopEvent(event)
      changeProjectPropertyRankUnified(
        organisationPropertyFormAdapter,
        propertyId,
        'up',
      )
      revalidateAfterProgrammaticChange()
    },
    decreaseRank: (event: Event, propertyId: Id): void => {
      stopEvent(event)
      changeProjectPropertyRankUnified(
        organisationPropertyFormAdapter,
        propertyId,
        'down',
      )
      revalidateAfterProgrammaticChange()
    },
  }
}

const updatePropertyBase = (
  propertyId: Id,
  key:
    | 'key'
    | 'component'
    | 'min'
    | 'max'
    | 'isTranslatable'
    | 'isDefaultEnabled'
    | 'isEnabled',
  value: string | number | null | boolean,
): void => {
  updateProjectPropertyBase(organisationPropertyFormAdapter, propertyId, key, value)
  revalidateAfterProgrammaticChange()
}

const updatePropertyI18n = (
  propertyId: Id,
  locale: Locale,
  key: 'label' | 'placeholder' | 'labelGen' | 'placeholderGen',
  value: string | boolean,
): void => {
  updateProjectPropertyI18n(
    organisationPropertyFormAdapter,
    propertyId,
    locale,
    key,
    value,
  )
  revalidateAfterProgrammaticChange()
}

const addPropertyValue = (propertyId: Id): void => {
  addProjectPropertyValue(organisationPropertyFormAdapter, propertyId)
  revalidateAfterProgrammaticChange()
}

/**
 * Sorts options by the selected locale and revalidates the current form.
 * @param propertyId - Property whose options should be sorted.
 * @param locale - Locale supplying the option labels.
 * @returns Nothing; updates option ranks in the form.
 */
const sortPropertyValuesAlphabetically = (propertyId: Id, locale: Locale): void => {
  sortProjectPropertyValuesAlphabetically(
    organisationPropertyFormAdapter,
    propertyId,
    locale,
  )
  revalidateAfterProgrammaticChange()
}

const removePropertyValue = (propertyId: Id, valueId: Id): void => {
  removeProjectPropertyValue(organisationPropertyFormAdapter, propertyId, valueId)
  revalidateAfterProgrammaticChange()
}

const movePropertyValue = (propertyId: Id, valueId: Id, targetIndex: number): void => {
  reorderProjectPropertyValue(
    organisationPropertyFormAdapter,
    propertyId,
    valueId,
    targetIndex,
  )
  revalidateAfterProgrammaticChange()
}

const updatePropertyValueI18n = (
  propertyId: Id,
  valueId: Id,
  locale: Locale,
  key: 'value',
  value: string,
): void => {
  updateProjectPropertyValueI18n(
    organisationPropertyFormAdapter,
    propertyId,
    valueId,
    locale,
    key,
    value,
  )
  revalidateAfterProgrammaticChange()
}

const updatePropertyValue = (
  propertyId: Id,
  valueId: Id,
  key: 'value',
  value: string,
): void => {
  updateProjectPropertyValue(
    organisationPropertyFormAdapter,
    propertyId,
    valueId,
    key,
    value,
  )
  revalidateAfterProgrammaticChange()
}

const onTranslatePropertyLocale = async (
  propertyId: Id,
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> => {
  const translated = await translateProjectPropertyLocale(
    organisationPropertyFormAdapter,
    propertyId,
    sourceLocale,
    targetLocale,
  )

  if (translated) revalidateAfterProgrammaticChange()

  return translated
}

const onResetPropertyLocale = (propertyId: Id, targetLocale: Locale): void => {
  resetProjectPropertyLocale(organisationPropertyFormAdapter, propertyId, targetLocale)
  revalidateAfterProgrammaticChange()
}

const organisationFieldsInSection = $derived(
  [...getCurrentProjectProperties(organisationPropertyFormAdapter)].sort(
    (left, right) => (left.rank ?? 0) - (right.rank ?? 0),
  ),
)

const fieldActions = createPropertyActions(() => organisationFieldsInSection.length)
const propertyFormIssues = $derived.by(
  (): Array<{ message: string; path?: Array<string | number> }> =>
    getPropertyFormIssues(visibleAllIssues),
)

const fieldSectionIssues = $derived.by(() => {
  const messages = propertyFormIssues.map(issue => issue.message).filter(Boolean)

  return Array.from(new Set(messages))
})

const fieldSectionIssueItemIds = $derived.by(() => {
  const properties = getCurrentProjectProperties(organisationPropertyFormAdapter)

  return Array.from(
    new Set(
      propertyFormIssues
        .map(issue => {
          const path = issue.path

          if (!Array.isArray(path)) return null

          const index = path[2]

          if (typeof index !== 'number') return null

          return properties[index]?.id ?? null
        })
        .filter((id): id is Id => Boolean(id)),
    ),
  )
})

function resolveOrganisationPropertyTypeTag(property: Property): {
  label?: string
  title?: string
  tone: 'global' | 'hub' | 'org' | 'project'
  iconComponent?: typeof Blend
} {
  return property.type === 'classifier'
    ? {
        tone: 'org',
        title: m.admin__forms_common_categorical_field(),
        iconComponent: Blend,
      }
    : {
        tone: 'org',
        title: m.admin__forms_common_free_form_field(),
        iconComponent: Type,
      }
}

// USER ROLES
const formUserRoleValues = $derived(
  (formCtx.form.fields.value().data?.userRoles ?? []) as Array<{
    userId: string
    role: string
  }>,
)

const userRoleResolverForm = $derived(
  formCtx.form as unknown as UserRoleFieldNameResolverForm,
)
const userRoleUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{
    userRoles?: Array<{ userId: string; role: string }>
  }>,
)
const hiddenUserIdInputAttrs = $derived(
  getUserRoleHiddenInputAttrs(userRoleResolverForm, formUserRoleValues),
)

const userRoles = $derived.by(() =>
  guardUserRolesDesync({
    baseRoles: (organisation?.data?.userRoles ?? []) as OrganisationRoleUser[],
    formUserRoles: formUserRoleValues,
    organisationId: organisation?.data?.id,
    usersById: selectedUsersById,
  }),
)

// CAPABILITIES
const capabilityFormUpdater = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{
    capabilities?: CapabilityDefinitions
  }>,
)

const formCapabilityDefinitions = $derived(
  (formCtx.form.fields.value().data?.capabilities ?? {}) as CapabilityDefinitions,
)
const selectedCapabilityKeys = $derived.by(() =>
  CAPABILITY_KEYS.filter(
    capabilityKey =>
      formCapabilityDefinitions[capabilityKey] !== null &&
      formCapabilityDefinitions[capabilityKey] !== undefined,
  ),
)
const selectedCapabilityIds = $derived(
  selectedCapabilityKeys.map(capabilityKey => capabilityKey),
)
const capabilitySearchOptions = $derived(
  CAPABILITY_KEYS.map(
    key =>
      ({
        id: key,
        key,
        i18n: CAPABILITY_I18N_BY_KEY[key],
      }) satisfies CapabilitySearchOption,
  ),
)
const capabilityLabelsByKey = CAPABILITY_I18N_BY_KEY
const shouldSubmitEmptyCapabilities = $derived(selectedCapabilityKeys.length === 0)

function onAddCapability(option: CapabilitySearchOption): void {
  updateFormData(capabilityFormUpdater, data => {
    const nextCapabilities = { ...(data.capabilities ?? {}) }
    nextCapabilities[option.key] = {
      i18n: {
        en: CAPABILITY_I18N_BY_KEY[option.key].en ?? option.key,
        zhHans:
          CAPABILITY_I18N_BY_KEY[option.key].zhHans ??
          CAPABILITY_I18N_BY_KEY[option.key].en ??
          option.key,
        zhHant:
          CAPABILITY_I18N_BY_KEY[option.key].zhHant ??
          CAPABILITY_I18N_BY_KEY[option.key].en ??
          option.key,
      },
    }

    data.capabilities = nextCapabilities

    return data
  })

  revalidateAfterProgrammaticChange()
}

function onRemoveCapability(capabilityKey: CapabilityKey): void {
  updateFormData(capabilityFormUpdater, data => {
    if (!data.capabilities) return data
    const nextCapabilities = { ...data.capabilities }
    delete nextCapabilities[capabilityKey]
    data.capabilities = nextCapabilities
    return data
  })
  revalidateAfterProgrammaticChange()
}

/**
 * Fills empty capability labels without overwriting edits made during translation.
 * @param sourceLocale - Locale to translate from.
 * @param targetLocale - Locale to fill.
 * @returns Whether any translated labels were applied.
 */
async function onTranslateCapabilities(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const source = toLocaleKey(sourceLocale)
  const target = toLocaleKey(targetLocale)
  const ref = organisationRef
  const resetVersion = capabilityResetVersion
  const snapshot = Object.fromEntries(
    selectedCapabilityKeys.map(key => [
      key,
      { i18n: { ...formCapabilityDefinitions[key]?.i18n } },
    ]),
  )
  const translated = await translateCapabilityLabels(
    snapshot,
    source,
    target,
    translateText,
  )
  if (ref !== organisationRef || resetVersion !== capabilityResetVersion || !isEditing)
    return false
  let applied = false
  // Recheck each field after the remote request so newer edits and removals win.
  updateFormData(capabilityFormUpdater, data => {
    for (const key of Object.keys(translated) as CapabilityKey[]) {
      const capability = data.capabilities?.[key]
      if (
        !capability ||
        capability.i18n?.[target]?.trim() ||
        capability.i18n?.[source] !== snapshot[key]?.i18n?.[source]
      )
        continue
      capability.i18n = { ...capability.i18n, [target]: translated[key] }
      applied = true
    }
    return data
  })
  if (applied) revalidateAfterProgrammaticChange()
  return applied
}

/**
 * Clears one locale's capability labels, ready for translation or manual entry.
 * @param targetLocale - Locale to clear.
 * @returns Nothing.
 */
function onResetCapabilityLocale(targetLocale: Locale): void {
  capabilityResetVersion += 1
  const target = toLocaleKey(targetLocale)
  updateFormData(capabilityFormUpdater, data => {
    for (const key of selectedCapabilityKeys) {
      const capability = data.capabilities?.[key]
      if (capability) capability.i18n = { ...capability.i18n, [target]: '' }
    }
    return data
  })
  revalidateAfterProgrammaticChange()
}

function getCapabilityDisplayLabel(capabilityKey: CapabilityKey): string {
  const labels = formCapabilityDefinitions[capabilityKey]?.i18n

  return (
    labels?.[currentLocaleKey]?.trim() ||
    getCapabilityLabel(capabilityKey, currentLocaleKey)
  )
}

// IMAGE

const activeOrganisationImage = $derived(
  (optimisticOrganisationData?.image ?? null) as ImageCtxEnvelope | null,
)
const imageProviderProps = $derived.by(() => {
  const organisationData = optimisticOrganisationData
  const isValid = isCurrentRefLoaded && Boolean(organisationData?.id)

  return {
    isAdminMode: true,
    isValid,
    image: isValid ? activeOrganisationImage : undefined,
    context: isValid
      ? {
          ctxType: ImageContextResource.organisation,
          ctxId: organisationData?.id,
          organisation: organisationData as unknown as OrganisationDB,
        }
      : undefined,
  }
})

const imageProviderModel = useImageProviderModel(
  () => page,
  () => imageProviderProps,
)

// § Auth
const currentUser = $derived(adminCtx.appCtx.getUser())

const currentHub = $derived(adminCtx.appCtx.hub)
const currentActor = $derived(toOrganisationAuthActor(currentUser))

const organisationPermissions = $derived.by(() => {
  const organisationData = optimisticOrganisationData
  const newEntityHubId = currentHub?.isCore
    ? null
    : ((currentHub as { id?: string } | null | undefined)?.id ?? null)
  return resolveOrganisationActionPermissions(
    currentActor,
    organisationData
      ? {
          resourceId: organisationData.id,
          resourceHubId: organisationData.hubId,
        }
      : {
          resourceHubId: newEntityHubId,
        },
    ['code'],
  )
})
const canCreateOrganisation = $derived(organisationPermissions.canCreate)
const canEditOrganisation = $derived(organisationPermissions.canEdit)
const canPublishOrganisation = $derived(organisationPermissions.canPublish)
const canDeleteOrganisation = $derived(organisationPermissions.canDelete)
const resolvedFacetTabs = $derived.by(() => {
  if (isNewOrganisationRef) {
    return getAdminFacetTabsForResource(FirstClassResource.organisation, {
      coreOnly: true,
    })
  }

  if (canEditOrganisation) return facetTabs

  const tabs = new Map(facetTabs)

  tabs.delete('capabilities')

  return tabs
})

const organisationFacetOrder = $derived.by(
  () =>
    getAdminFacetOrderForResource(
      FirstClassResource.organisation,
      resolvedFacetTabs,
    ) as OrganisationFacet[],
)

const buildFacetNavAction = createFacetNavActionBuilder<OrganisationFacet>({
  resourceType: FirstClassResource.organisation,
  getFacetOrder: () => organisationFacetOrder,
  getActiveFacet: () => activeFacet as OrganisationFacet,
  navigateToFacet: facet =>
    navigateOnAdmin(adminCtx, FirstClassResource.organisation, organisationRef, facet),
})

$effect(() => {
  const currentHash = page.url.hash
  if (currentHash === lastSyncedFacetHash) return
  lastSyncedFacetHash = currentHash
  syncAdminFacetFromHash({
    hash: currentHash,
    activeFacet,
    facetOrder: organisationFacetOrder,
    adminCtx,
    resourceType: FirstClassResource.organisation,
    resourceRef: organisationRef,
  })
})

bindAdminFacetHistorySync({
  getFacetOrder: () => organisationFacetOrder,
  getActiveFacet: () => adminCtx.activeFacet as OrganisationFacet | false,
  adminCtx,
  resourceType: FirstClassResource.organisation,
  getResourceRef: () => organisationRef,
})

const canSubmitOrganisation = $derived(
  isNewOrganisationRef ? canCreateOrganisation : canEditOrganisation,
)
const canEditImagePresentationMode = $derived(
  canSubmitOrganisation &&
    isCurrentRefLoaded &&
    !optimisticOrganisationData?.isArchived,
)
const canEditImageDropzone = $derived(
  canEditOrganisation && isCurrentRefLoaded && !optimisticOrganisationData?.isArchived,
)
const isFormReady = $derived(
  Boolean(
    formCtx.form?.fields &&
      (isNewOrganisationRef || (isCurrentRefLoaded && organisation?.data)),
  ),
)

const hasProfileLoadFailed = $derived(
  !isNewOrganisationRef &&
    completedOrganisationLoadRef === organisationRef &&
    !isCurrentRefLoaded,
)

// § Handlers
// i18N CARDS

function revalidateAfterProgrammaticChange(): void {
  revalidateAfterSubmitAttempt({
    wasSubmitAttempted: formCtx.wasSubmitAttempted,
    validate: formCtx.validate,
  })
}

async function onTranslate(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const translated = await translateLocaleIntoEmptyFields({
    form: formCtx.form,
    sourceLocale,
    targetLocale,
    fields: [...translatableI18nFields],
  })
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

function onResetLocale(targetLocale: Locale): void {
  resetLocaleFields({
    form: formCtx.form,
    targetLocale,
    fields: [...translatableI18nFields],
  })
  revalidateAfterProgrammaticChange()
}

// USER ROLES

function onAddUser(user: User): void {
  selectedUsersById[user.id] = user
  organisation = addUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: organisation,
    user,
    defaultRole: OrganisationRoleType.member,
    foreignKey: 'organisationId',
  })
  revalidateAfterProgrammaticChange()
}

function onRemoveUser(userId: string): void {
  const { [userId]: _removedUser, ...rest } = selectedUsersById
  selectedUsersById = rest
  organisation = removeUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: organisation,
    userId,
  })
  revalidateAfterProgrammaticChange()
}

function onRoleChange(userId: string, role: OrganisationRoleType): void {
  organisation = updateUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: organisation,
    userId,
    role,
  })
  revalidateAfterProgrammaticChange()
}

// RESOURCE STATE

async function refreshOrganisation(
  ref: string = organisationRef,
): Promise<OrganisationGetState> {
  if (ref === NEW_REF) return null
  return await getOrganisation<'admin'>({
    ref,
    refKey: 'code',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).catch(() => null)
}

/**
 * Retries a failed profile load without committing a response to a different route.
 * @returns Resolves after the current request completes.
 */
async function retryOrganisationLoad(): Promise<void> {
  const ref = organisationRef
  completedOrganisationLoadRef = null
  const result = await refreshOrganisation(ref)
  if (ref !== organisationRef) return
  commitSettledOrganisationState(result)
  completedOrganisationLoadRef = ref
}

async function handleOrganisationStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
}: {
  field: OrganisationBooleanField
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: typeof publishOrganisation | typeof archiveOrganisation
}): Promise<void> {
  const organisationData = organisation?.data

  if (!organisationData) return

  const nextState = !organisationData[field]

  setBusy(true)

  const mutation = adminCtx.appCtx.cacheCtx.beginMutation('organisation', {
    meta: { id: organisationData.id },
    data: { [field]: nextState },
  })
  try {
    await mutate({
      id: organisationData.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      ...mutation.updates,
      getOrganisation({
        ref: organisationRef,
        refKey: 'code',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(overrideOrganisationEntityBoolean(field, nextState)),
      // TODO Invalidate cache
      getOrganisations({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(
        overrideOrganisationListItemBoolean(organisationData.id, field, nextState),
      ),
    )
    mutation.settle(true)
    // TODO Invalidate cache
    commitSettledOrganisationState(await refreshOrganisation())

    await adminCtx.appCtx.cacheCtx.reconcile('organisation')
    toast.success(
      `${nextState ? successWhenTrue : successWhenFalse} ${getNameForToast(organisation, 'nameShort')}`,
    )
  } catch {
    mutation.settle(false)
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

async function onPublishToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canPublishOrganisation) return
  await handleOrganisationStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishOrganisation,
  })
}

async function onDeleteToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canDeleteOrganisation) return
  await handleOrganisationStateToggle({
    field: 'isArchived',
    successWhenTrue: m.bad_swift_cheetah_surge(),
    successWhenFalse: m.forms__restored(),
    setBusy: value => headerCtrl.setDeleting(value),
    mutate: archiveOrganisation,
  })
}

function onReset(): void {
  fieldRemoveMode = false
  fieldsLayoutMutationVersion += 1
  capabilityResetVersion += 1
  suppressFormLevelIssues = true
  formCtx.clearSubmitAttemptState()
  if (committedOrganisation?.data) {
    organisation = committedOrganisation
    formCtx.form.fields.set(toOrganisationFormInput(committedOrganisation.data))
    return
  }
  formCtx.reset()
}

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) {
    return
  }
  if (isNewOrganisationRef) {
    formCtx.requestSubmit({ meta: { mode: 'create' } })
    return
  }
  const baseMeta = committedOrganisation?.data
    ? (toOrganisationFormInput(committedOrganisation.data).meta ?? {})
    : undefined
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

function onPresentationModeCommitted(nextMode: 'cover' | 'contain'): void {
  if (!canEditImagePresentationMode) return
  setOrganisationImagePresentationMode(organisation, nextMode)
  setOrganisationImagePresentationMode(committedOrganisation, nextMode)
}

// § Effects

// Seed the next route with cached entity data when available.
$effect(() => {
  organisationRef

  const cachedCode = cachedOrganisationState?.data?.code

  if (!cachedCode) return
  if (organisation?.data?.code === cachedCode) return

  commitOrganisationState(cachedOrganisationState)
})

// Preserve the previous page's form affordances while the next ref resolves auth.
$effect(() => {
  organisationRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

// Keep facet + entity data in sync with the current route ref.
$effect(() => {
  const ref = organisationRef
  return editorCtrl.syncRouteAndLoad({
    ref,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      settledOrganisationRef = null
      completedOrganisationLoadRef = null
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet = currentFacet || 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.organisation)
      })
    },
    load: refreshOrganisation,
    commit: result => {
      commitSettledOrganisationState(result)
      completedOrganisationLoadRef = ref
    },
  })
})

$effect(() => {
  activeFacet
  contentsElement
  focusFacetFromHash(contentsElement, activeFacet)
})

// Keep entity header metadata (title/icon/facets) aligned with loaded organisation data.
$effect(() => {
  const title =
    (isNewOrganisationRef ? `${NEW_TITLE} ${m.any_small_midge_aim()}` : undefined) ??
    optimisticOrganisationData?.i18n?.[getLocaleKey()]?.name ??
    optimisticOrganisationData?.code ??
    m.any_small_midge_aim()
  const displayFacets = resolveOptimisticHeaderFacets(
    isCurrentRefSettled,
    resolvedFacetTabsWithIssues,
    optimisticHeaderState,
  )
  const facetKey = Array.isArray(displayFacets)
    ? displayFacets
        .map(facet => `${facet.ref}:${facet.hasIssues === true ? '1' : '0'}`)
        .join('|')
    : Array.from(displayFacets.entries())
        .map(([facet, config]) => `${facet}:${config.hasIssues ? '1' : '0'}`)
        .join('|')

  const headerKey = `${organisationRef}:${title}:${facetKey}`

  if (headerKey === lastHeaderKey) return

  lastHeaderKey = headerKey

  if (Array.isArray(displayFacets)) {
    headerCtrl.setHeaderForEntity(title, OrganisationIcon, new Map())
    headerCtrl.setFacets(displayFacets)
    return
  }
  headerCtrl.setHeaderForEntity(title, OrganisationIcon, displayFacets)
})

$effect(() => {
  if (!formCtx.wasSubmitAttempted) return
  if (visibleAllIssues.length === 0) return

  const targetFacet = facetIssueSummary.firstFacetWithIssues

  if (!targetFacet) return
  if (activeFacet === targetFacet) return

  adminCtx.setFacet(targetFacet, organisationRef, FirstClassResource.organisation)
})

// Archived entities are read-only until restored.
$effect(() => {
  if (!optimisticOrganisationData?.isArchived) return
  if (!headerCtrl.state.isEditing) return

  headerCtrl.setEditing(false)
})

// New routes are create-only; users without create access are sent back to index.
$effect(() => {
  if (!isNewOrganisationRef) return
  if (canCreateOrganisation) return

  navigateOnAdmin(adminCtx, FirstClassResource.organisation)
})

// New entities start in edit mode.
$effect(() => {
  if (!isNewOrganisationRef) {
    hasAutoEnteredEditForNew = false
    return
  }
  if (!canSubmitOrganisation) return
  if (hasAutoEnteredEditForNew) return
  if (headerCtrl.state.isEditing) return
  headerCtrl.setEditing(true)
  hasAutoEnteredEditForNew = true
})

// Keep unauthorized users out of edit mode if the header state gets toggled externally.
$effect(() => {
  if (!isCurrentRefSettled && !isNewOrganisationRef) return
  if (canSubmitOrganisation) return
  if (!headerCtrl.state.isEditing) return

  headerCtrl.setEditing(false)
})

// Capabilities facet is only available to users who can edit organisations.
$effect(() => {
  if (!isCurrentRefSettled) return
  if (activeFacet !== 'capabilities') return
  if (canEditOrganisation) return

  adminCtx.setFacet('core', organisationRef, FirstClassResource.organisation)
})

// Guard unsupported facet states (for permission-constrained views).
$effect(() => {
  if (!isCurrentRefSettled) return
  if (resolvedFacetTabs.has(activeFacet)) return

  adminCtx.setFacet('core', organisationRef, FirstClassResource.organisation)
})

// Wire stable header action handlers once.
$effect(() => {
  editorCtrl.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    toggleDelete: onDeleteToggle,
  })
})

// Push reactive form/resource status state into shared header controls.
$effect(() => {
  const isImageFacetActive = isImagesFacet
  const status = resolveOptimisticHeaderStatus({
    isSettled: isCurrentRefSettled,
    isImageFacetActive,
    isNewRef: isNewOrganisationRef,
    dirty: isDirty,
    isSubmitting: formCtx.submitting,
    hasIssues: visibleAllIssues.length > 0,
    isPublished: Boolean(optimisticOrganisationData?.isPublished),
    isDeleted: Boolean(optimisticOrganisationData?.isArchived),
    canEdit: canSubmitOrganisation,
    canPublish: canPublishOrganisation,
    showDeleteAction: !isNewOrganisationRef && canDeleteOrganisation,
    showPublishAction: !isNewOrganisationRef,
    snapshot: optimisticHeaderState,
  })
  const inertActionOverrides =
    isCurrentRefSettled && !isImageFacetActive
      ? {}
      : {
          onEditingToggle: () => {},
          onReset: () => {},
          onSave: () => {},
          onDeleteToggle: () => {},
          onPublishToggle: () => {},
        }
  lastFormActionsSignature = editorCtrl.syncHeaderStatus({
    headerCtrl,
    status: {
      ...status,
      ...inertActionOverrides,
    },
    lastSignature: lastFormActionsSignature,
  })
})
</script>

<Main.Root>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={isFormReady}
  >
    {#snippet fallback()}
      <Main.Facet isVisible={!isImagesFacet} class="left-0! right-0!" fillHeight={true}>
        {#if hasProfileLoadFailed}
          <FormSurface>
            <div role="alert" class="p-6">
              <p class="text-sm text-muted-foreground">
                {m.admin__forms_profile_load_failed()}
              </p>
              <button
                type="button"
                class="mt-4 rounded-lg border border-border px-4 py-2 text-sm hover:bg-raised"
                onclick={retryOrganisationLoad}
              >
                {m.retry()}
              </button>
            </div>
          </FormSurface>
        {:else if !isCoreFacet}
          <FormSurface>
            <div role="status" aria-label={m.resource_loading()} aria-busy="true">
              <FormSectionSkeleton
                divided={false}
                title={isCapabilitiesFacet
                  ? m.resources__capabilities()
                  : m.admin__forms_common_fields()}
                icon={isCapabilitiesFacet ? ShieldIcon : Type}
              >
                <div class="space-y-4 p-6">
                  {#each Array(3) as _}
                    <Skeleton class="h-14 w-full rounded-md" />
                  {/each}
                </div>
              </FormSectionSkeleton>
            </div>
          </FormSurface>
        {:else}
          <FormProfileSkeleton
            {locales}
            profileIcon={OrganisationIcon}
            membersIcon={OrganisationIcon}
            detailsIcon={Type}
            membersTitle={m.admin__forms_organisation_members_title()}
            membersSubtitle={m.admin__forms_organisation_members_subtitle()}
          />
        {/if}
      </Main.Facet>
    {/snippet}
    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('core', 'previous')}
      nextAction={buildFacetNavAction('core', 'next')}
      class="left-0! right-0!"
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormSurface>
        <FormI18nSection
          title="Profile"
          localeCodeClass="absolute right-6 top-3 text-base font-medium uppercase text-muted-foreground"
          {locales}
          {onTranslate}
          {onResetLocale}
          {isEditing}
        >
          {#snippet left()}
            <div class="flex items-center gap-3">
              <OrganisationIcon class="size-6 text-primary" aria-hidden="true" />
              <h2 class="text-xl font-semibold tracking-tight">Profile</h2>
            </div>
          {/snippet}

          {#snippet center()}
            <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
          {/snippet}

          {#snippet children(
            locale,
          )}
            <FormI18nDescriptorFields
              form={formCtx.form}
              fields={formCtx.form.fields.data.i18n[locale]}
              {locale}
              {isEditing}
              {isRequiredInPreflight}
            />
          {/snippet}
        </FormI18nSection>

        {@const roleFieldNameByUserId = getRoleFieldNameByUserId(userRoleResolverForm)}
        <div class={formSectionDividerStyles}>
          <FormUserRolesSection
            currentUserId={currentActor.userId}
            icon={OrganisationIcon}
            layout="list"
            title={m.admin__forms_organisation_members_title()}
            subtitle={m.admin__forms_organisation_members_subtitle()}
            transitionEntityKey={organisation?.data?.id ?? organisationRef}
            removeSelfResourceLabel={m.resource__organisation_singular()}
            issues={userRoleSectionIssues}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewOrganisationRef}
            {userRoles}
            {hiddenUserIdInputAttrs}
            {roleFieldNameByUserId}
            {isEditing}
            {onAddUser}
            {onRemoveUser}
            {onRoleChange}
          />
        </div>
        <div class={formSectionDividerStyles}>
          <FormSpecifiersFields
            icon={Type}
            title="Details"
            form={formCtx.form}
            {isEditing}
            {isRequiredInPreflight}
          />
        </div>
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      isVisible={isCapabilitiesFacet && canEditOrganisation}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('capabilities', 'previous')}
      nextAction={buildFacetNavAction('capabilities', 'next')}
      class="left-0! right-0!"
      attrs={{ 'data-facet-id': 'capabilities' }}
    >
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        <OrganisationCapabilities
          {selectedCapabilityKeys}
          {capabilitySearchOptions}
          {selectedCapabilityIds}
          {currentLocaleKey}
          {locales}
          {isEditing}
          isArchived={Boolean(optimisticOrganisationData?.isArchived)}
          resetVersion={capabilityResetVersion}
          {capabilityLabelsByKey}
          formCapabilityFields={formCtx.form.fields.data
            .capabilities as CapabilityFormFields}
          emptyCapabilitiesInputAttrs={formCtx.form.fields.data.capabilities.as(
            'hidden',
            '{}',
          )}
          {shouldSubmitEmptyCapabilities}
          {capabilityIssues}
          {isRequiredInPreflight}
          {getCapabilityDisplayLabel}
          {onAddCapability}
          {onRemoveCapability}
          onTranslate={onTranslateCapabilities}
          onResetLocale={onResetCapabilityLocale}
          onEnterEditMode={() => headerCtrl.setEditing(true)}
        />
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      isVisible={isFieldsFacet}
      transition="fade"
      fillHeight={true}
      class="bits-theme min-h-0 left-0! right-0!"
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        <FormFieldsSection
          icon={Type}
          keepHeader
          items={organisationFieldsInSection}
          title={m.admin__forms_common_fields()}
          description={m.admin__forms_common_fields_subtitle()}
          issues={fieldSectionIssues}
          actions={fieldActions}
          issueItemIds={fieldSectionIssueItemIds}
          layoutMutationVersion={fieldsLayoutMutationVersion}
          canEdit={canSubmitOrganisation || !isCurrentRefSettled}
          disableEmptyAdd={Boolean(optimisticOrganisationData?.isArchived)}
          {isEditing}
          removeMode={fieldRemoveMode}
          onRemoveModeChange={value => {
            fieldRemoveMode = value
          }}
          card={{
            removeMode: fieldRemoveMode,
            locales,
            isEditing,
            isRequiredInPreflight,
            allIssues: visibleAllIssues as Array<{
              message: string
              path?: Array<string | number>
            }>,
            classifierComponents: classifierComponentTypes,
            specifierComponents: specifierComponentTypes,
            onIncreaseRank: fieldActions.increaseRank,
            onDecreaseRank: fieldActions.decreaseRank,
            onRemove: fieldActions.remove,
            onUpdateBase: updatePropertyBase,
            onUpdateI18n: updatePropertyI18n,
            onAddValue: addPropertyValue,
            onSortValuesAlphabetically: sortPropertyValuesAlphabetically,
            onRemoveValue: removePropertyValue,
            onMoveValue: movePropertyValue,
            onUpdateValue: updatePropertyValue,
            onUpdateValueI18n: updatePropertyValueI18n,
            onTranslateLocale: onTranslatePropertyLocale,
            onResetLocale: onResetPropertyLocale,
            getPropertyIndex: (propertyId, _sectionIndex) =>
              getCurrentProjectProperties(organisationPropertyFormAdapter).findIndex(
                candidate => candidate.id === propertyId,
              ),
            getPropertyFields: (_propertyId, propertyIndex) =>
              getProjectPropertyFieldsForIndex(formCtx.form, propertyIndex),
            resolveSourceTag: resolveOrganisationPropertyTypeTag,
          }}
        />
      </FormSurface>
    </Main.Facet>
  </Main.Form>
  <Main.Facet
    isVisible={isImagesFacet}
    transition="fade"
    fillHeight={true}
    edgeToEdge={true}
    contentClass="h-full overflow-hidden"
    attrs={{ 'data-facet-id': 'images' }}
  >
    <FormSurface class="mb-0! flex h-full min-h-0 flex-col">
      <SectionHeader
        icon={ImageIcon}
        title={m.admin__forms_organisation_image_title()}
        class="shrink-0"
      />
      <div class="min-h-0 flex-1">
        {#if !isFormReady && !hasProfileLoadFailed}
          <div
            role="status"
            aria-label={m.resource_loading()}
            aria-busy="true"
            class="h-full p-6"
          >
            <Skeleton class="h-full min-h-64 w-full rounded-xl" />
          </div>
        {:else if hasProfileLoadFailed}
          <div role="alert" class="p-6 text-sm text-muted-foreground">
            <p>{m.admin__forms_profile_load_failed()}</p>
            <button
              type="button"
              class="mt-4 rounded-lg border border-border px-4 py-2 hover:bg-raised"
              onclick={retryOrganisationLoad}
            >
              {m.retry()}
            </button>
          </div>
        {:else if imageProviderProps.isValid}
          <ImageProvider model={imageProviderModel}>
            <ResourceViewer
              workspace
              canEditPresentationMode={canEditImagePresentationMode}
              canEditDropzone={canEditImageDropzone}
              {onPresentationModeCommitted}
            />
          </ImageProvider>
        {:else}
          <div
            class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/65"
          >
            {m.admin__forms_organisation_image_save_hint()}
          </div>
        {/if}
      </div>
    </FormSurface>
  </Main.Facet>
</Main.Root>
