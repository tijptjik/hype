<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { untrack } from 'svelte'
import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'
import type { StandardSchemaV1 } from '@standard-schema/spec'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleKey, getLocaleOrder, toLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  captureHeaderTransitionSnapshot,
  createResourceEditorPage,
  createResourceFormConfig,
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
  toFormLevelIssueMessages,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
} from '$lib/client/services/form'
import { getNameForToast } from '$lib/client/services/resource'
import {
  getOrganisationSubmitUpdates,
  overrideOrganisationEntityBoolean,
  overrideOrganisationListItemBoolean,
  toOrganisationFormInput,
} from '$lib/client/services/organisation'
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
  translateProjectPropertyLocale,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  updateProjectPropertyValue,
  updateProjectPropertyValueI18n,
} from '$lib/client/services/property'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveOrganisation,
  getOrganisation,
  getOrganisations,
  organisationForm,
  publishOrganisation,
} from '$lib/api/server/organisation.remote'
import {
  toOrganisationAuthActor,
  resolveOrganisationActionPermissions,
} from '$lib/api/services/authz'
// SCHEMA
import { OrganisationPreflightFormData } from '$lib/db/zod'
import {
  CAPABILITY_I18N_BY_KEY,
  CAPABILITY_KEYS,
  getCapabilityLabel,
} from '$lib/capabilities'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  FormI18nDescriptorFields,
  FormI18nSection,
  FormFieldsSection,
  OrganisationCapabilities,
  FormSpecifiersFields,
  FormUserRolesSection,
  GridSpacer,
  Main,
  EntityImage,
} from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// CLIENT SERVICES
import { setOrganisationImagePresentationMode } from '$lib/client/services/image'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// NAVIGATION
import { getAdminFacetTabsForResource, navigateOnAdmin } from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer, toIssueMessages } from '$lib/utils/form-schema'
// ICONS
import Blend from 'virtual:icons/lucide/blend'
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import Type from 'virtual:icons/lucide/type'
// ENUMS
import {
  FirstClassResource,
  ImageContextResource,
  OrganisationRoleType,
} from '$lib/enums'
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types'
// TYPES
import type {
  Locale,
  User,
  UserRoleFieldNameResolverForm,
  FormDataUpdaterForm,
  Id,
  CapabilityDefinitions,
  CapabilityKey,
  HeaderTransitionSnapshot,
} from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type {
  OrganisationBooleanField,
  OrganisationDB,
  OrganisationGetState,
  OrganisationRoleUser,
} from '$lib/db/zod/schema/organisation.types'
import type { CapabilityFormFields, CapabilitySearchOption } from '$lib/bits'

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = getAdminFacetTabsForResource(FirstClassResource.organisation)

const resourceEditorPage = createResourceEditorPage({
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
const cachedOrganisationForRef = $derived(
  adminCtx.appCtx.getResourceByRefSync(
    FirstClassResource.organisation,
    organisationRef,
  ) as OrganisationDB | undefined,
)
const cachedOrganisationState = $derived(
  cachedOrganisationForRef
    ? ({ data: cachedOrganisationForRef } as OrganisationGetState)
    : null,
)

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let fieldsLayoutMutationVersion = $state(0)
let capabilityResetVersion = $state(0)
let selectedUsersById = $state<Record<string, User>>({})
let hasAutoEnteredEditForNew = $state(false)
let settledOrganisationRef = $state<string | null>(null)
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
      committedOrganisation?.data as any,
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

function getCapabilityDisplayLabel(capabilityKey: CapabilityKey): string {
  const labels = formCapabilityDefinitions[capabilityKey]?.i18n
  return (
    labels?.[currentLocaleKey]?.trim() ||
    getCapabilityLabel(capabilityKey, currentLocaleKey)
  )
}

// IMAGE

const activeOrganisationImage = $derived(
  ((organisation as OrganisationGetState)?.data?.image ??
    null) as ImageCtxEnvelope | null,
)
const imageProviderProps = $derived.by(() => {
  const organisationData = organisation?.data
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
  Boolean(formCtx.form?.fields && (organisation?.data || isNewOrganisationRef)),
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

  try {
    await mutate({
      id: organisationData.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      getOrganisation({
        ref: organisationRef,
        refKey: 'code',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(
        overrideOrganisationEntityBoolean(field, nextState),
        // TODO Invalidate cache
      ),
      getOrganisations({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(
        overrideOrganisationListItemBoolean(organisationData.id, field, nextState),
        // TODO Invalidate cache
      ),
    )
    commitSettledOrganisationState(await refreshOrganisation())
    toast.success(
      `${nextState ? successWhenTrue : successWhenFalse} ${getNameForToast(organisation, 'nameShort')}`,
    )
  } catch {
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
  if (!isCurrentRefLoaded) return
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
    formCtx.form.fields.set(toOrganisationFormInput(committedOrganisation.data as any))
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
    ? (toOrganisationFormInput(committedOrganisation.data as any).meta ?? {})
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
  return resourceEditorPage.syncRouteAndLoad({
    ref: organisationRef,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      settledOrganisationRef = null
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet = currentFacet || 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.organisation)
      })
    },
    load: refreshOrganisation,
    commit: commitSettledOrganisationState,
  })
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
  resourceEditorPage.wireHeaderHandlers({
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
  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
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
    class="space-y-4"
  >
    <Main.Section
      isVisible={isCoreFacet}
      transition="fade"
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormI18nSection
        title={m.admin__forms_common_descriptors()}
        {locales}
        {onTranslate}
        {onResetLocale}
        {isEditing}
      >
        {#snippet center()}
          <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
        {/snippet}

        {#snippet children(locale)}
          <FormI18nDescriptorFields
            form={formCtx.form}
            fields={formCtx.form.fields.data.i18n[locale]}
            {locale}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </FormI18nSection>

      <GridSpacer>
        {#snippet left()}
          {@const roleFieldNameByUserId = getRoleFieldNameByUserId(userRoleResolverForm)}
          <FormUserRolesSection
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
        {/snippet}

        {#snippet right()}
          <FormSpecifiersFields
            form={formCtx.form}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </GridSpacer>
    </Main.Section>
    <Main.Section
      isVisible={isCapabilitiesFacet && canEditOrganisation}
      transition="fade"
      attrs={{ 'data-facet-id': 'capabilities' }}
    >
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
        formCapabilityFields={formCtx.form.fields.data.capabilities as CapabilityFormFields}
        {shouldSubmitEmptyCapabilities}
        {capabilityIssues}
        {isRequiredInPreflight}
        {getCapabilityDisplayLabel}
        {onAddCapability}
        {onRemoveCapability}
        onEnterEditMode={() => headerCtrl.setEditing(true)}
      />
    </Main.Section>
    <Main.Section
      isVisible={isFieldsFacet}
      transition="fade"
      class="bits-theme min-h-0 pb-4"
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormFieldsSection
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
    </Main.Section>
  </Main.Form>
  <Main.Section
    isVisible={isImagesFacet}
    transition="fade"
    class="flex min-h-0 flex-col"
    attrs={{ 'data-facet-id': 'images' }}
  >
    <EntityImage
      {page}
      entityId={organisation?.data?.id}
      {imageProviderProps}
      currentImage={activeOrganisationImage}
      ctx={organisation?.data?.id
        ? {
            ctxType: ImageContextResource.organisation,
            ctxId: organisation?.data?.id,
          }
        : undefined}
      canEditPresentationMode={canEditImagePresentationMode}
      canEditDropzone={canEditImageDropzone}
      {onPresentationModeCommitted}
    />
  </Main.Section>
</Main.Root>
