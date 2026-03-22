<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { tick, untrack } from 'svelte'
import { fade } from 'svelte/transition'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleKey, getLocaleOrder } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  applyChangedRelationField,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceEditorPage,
  createResourceFormConfig,
  focusFacetFromHash,
  guardRefDesync,
  getUserRoleHiddenInputAttrs,
  getRoleFieldNameByUserId,
  isFormLevelIssue,
  prepareSubmitPayloadMeta,
  revalidateAfterSubmitAttempt,
  removeUserRoleSelection,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
  resetLocaleFields,
} from '$lib/client/services/form'
import {
  getHubOrganisationHiddenInputAttrs,
  getHubLayerDefaultHiddenInputAttrs,
  getHubSubmitUpdates,
  overrideHubEntityBoolean,
  overrideHubListItemBoolean,
  toHubFormInput,
} from '$lib/client/services/hub'
import {
  normalizePropertiesForSubmit,
  toStableSignature,
} from '$lib/client/services/project'
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
  scrollWithMovedProperty,
  stopEvent,
  translateProjectPropertyLocale,
  updateProjectPropertyValue,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  updateProjectPropertyValueI18n,
} from '$lib/client/services/property'
import { setHubImagePresentationMode } from '$lib/client/services/image'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveHub,
  getHub,
  getHubs,
  hubForm,
  publishHub,
} from '$lib/api/server/hub.remote'
import { toHubAuthActor, resolveHubActionPermissions } from '$lib/api/services/authz'
import { getOrganisations } from '$lib/api/server/organisation.remote'
// SCHEMA
import { HubPreflightFormData } from '$lib/db/zod/schema/hub'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  EntityImage,
  FormFieldsSection,
  FormHubLayersSection,
  FormOrganisationsSection,
  FormHubSpecifiersFields,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormUserRolesSection,
  GridSpacer,
  Main,
} from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// NAVIGATION
import {
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
  navigateOnAdmin,
} from '$lib/navigation'
import type { HubFacet } from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
// ICONS
import Blend from 'virtual:icons/lucide/blend'
import HubIcon from 'virtual:icons/lucide/building-2'
import Type from 'virtual:icons/lucide/type'
// ENUMS
import {
  classifierComponentTypes,
  FirstClassResource,
  HubRoleType,
  ImageContextResource,
  specifierComponentTypes,
} from '$lib/enums'
// TYPES
import type {
  Id,
  Locale,
  User,
  UserRoleDisco,
  UserRoleFieldNameResolverForm,
  HubOrganisationFieldNameResolverForm,
  FormDataUpdaterForm,
  HeaderTransitionSnapshot,
} from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Hub, HubGetState, HubRoleUser } from '$lib/db/zod/schema/hub.types'

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = getAdminFacetTabsForResource(FirstClassResource.hub)
const resolvedFacetTabs = $derived.by(() =>
  isNewHubRef
    ? getAdminFacetTabsForResource(FirstClassResource.hub, {
        coreOnly: true,
      })
    : facetTabs,
)

const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: HubIcon,
  facetTabs,
})

// § Config - Derived

const hubRef = $derived(page.params.hub as string)
const locales = $derived(getLocaleOrder(getLocaleKey()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const cachedHubForRef = $derived(
  adminCtx.appCtx.getResourceByRefSync(FirstClassResource.hub, hubRef) as
    | Hub
    | undefined,
)
const cachedHubState = $derived(
  cachedHubForRef ? ({ data: cachedHubForRef } as HubGetState) : null,
)

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let fieldsLayoutMutationVersion = $state(0)
let selectedUsersById = $state<Record<string, User>>({})
let selectedOrganisationsById = $state<Record<string, any>>({})
let hasAutoEnteredEditForNew = $state(false)
let settledHubRef = $state<string | null>(null)
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

let hub: HubGetState = $state(null)
let committedHub: HubGetState = $state(null)

const commitHubState = (value: HubGetState): void => {
  committedHub = value
  hub = value
}

const commitSettledHubState = (value: HubGetState): void => {
  commitHubState(value)
  settledHubRef = value?.data?.code ?? null
}

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isLayersFacet = $derived(activeFacet === 'layers')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewHubRef = $derived(hubRef === NEW_REF)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewHubRef) return true
  return guardRefDesync(hub, committedHub, hubRef)
})
const isCurrentRefSettled = $derived(isNewHubRef || settledHubRef === hubRef)

// § Form

const translatableI18nFields = ['name', 'nameShort', 'description'] as const
const configuredHubForm = configureForm<any>(() => ({
  form: hubForm,
  onsubmit: (({ data }: { data: any }) => {
    const submittedPayload = prepareSubmitPayloadMeta(data, {
      defaultMode: isNewHubRef ? 'create' : 'update',
      resolveUpdateId: () => hub?.data?.id ?? committedHub?.data?.id ?? '',
    })
    if (isNewHubRef) {
      submittedPayload.meta.mode = 'create'
      delete submittedPayload.meta.id
      delete (submittedPayload.meta as { updatedAt?: unknown }).updatedAt
    }

    const baselineFormInput = toHubFormInput(committedHub?.data)
    const currentFormSnapshot = formCtx.form.fields.value() as {
      data?: {
        properties?: Array<Record<string, unknown>>
        layerDefaults?: Array<Record<string, unknown>>
      }
    }

    applyChangedRelationField({
      data: submittedPayload.data,
      key: 'properties',
      submittedValue: submittedPayload.data.properties,
      currentValue: currentFormSnapshot.data?.properties,
      baselineValue: baselineFormInput.data?.properties ?? [],
      toEffective: ({ submittedValue, currentValue }) => {
        const raw =
          submittedValue ?? currentValue ?? baselineFormInput.data?.properties ?? []
        if (!Array.isArray(raw)) return []
        return normalizePropertiesForSubmit(raw as Array<Record<string, unknown>>)
      },
      toComparableEffective: value => value,
      toComparableBaseline: value =>
        normalizePropertiesForSubmit(value as Array<Record<string, unknown>>),
      toSignature: toStableSignature,
    })

    applyChangedRelationField({
      data: submittedPayload.data,
      key: 'layerDefaults',
      submittedValue: submittedPayload.data.layerDefaults,
      currentValue: currentFormSnapshot.data?.layerDefaults,
      baselineValue: baselineFormInput.data?.layerDefaults ?? [],
      toEffective: ({ submittedValue, currentValue }) => {
        const raw =
          submittedValue ?? currentValue ?? baselineFormInput.data?.layerDefaults ?? []
        if (!Array.isArray(raw)) return []
        return raw
          .map(item => ({
            hubId: typeof item?.hubId === 'string' ? item.hubId : '',
            layerId: typeof item?.layerId === 'string' ? item.layerId : '',
            isDefaultVisible: Boolean(item?.isDefaultVisible),
          }))
          .filter(item => item.hubId && item.layerId)
      },
      toComparableEffective: value =>
        (Array.isArray(value) ? value : []).map(item => ({
          layerId: item.layerId,
          isDefaultVisible: Boolean(item.isDefaultVisible),
        })),
      toComparableBaseline: value =>
        (Array.isArray(value) ? value : []).map(item => ({
          layerId: item.layerId,
          isDefaultVisible: Boolean(item.isDefaultVisible),
        })),
      toSignature: toStableSignature,
    })

    return submittedPayload as typeof data
  }) as never,
  ...createResourceFormConfig<any>({
    formEl: contentsElement,
    key: hubRef,
    schema: HubPreflightFormData,
    data: toHubFormInput(committedHub?.data),
    submitUpdates: async ({ data }) =>
      getHubSubmitUpdates({
        hubId: hub?.data?.id,
        entityQuery: getHub({
          ref: hubRef,
          refKey: 'code',
          meta: { isAdminRequest: true, profile: 'detail' },
        }),
        listQuery: getHubs({
          conditions: adminCtx.appCtx.isSuperAdmin()
            ? { isArchived: null, isPublished: null }
            : { isArchived: false, isPublished: null },
          meta: { isAdminRequest: true, profile: 'card' },
        }),
      }),
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.hub,
    getEntity: () => hub,
    refreshResource: async ({ data, shouldRedirect }) => {
      const submittedCode = data.data?.code?.trim() ?? ''
      const refreshed = await refreshHub(shouldRedirect ? submittedCode : undefined)
      commitSettledHubState(refreshed)
      if (refreshed?.data) {
        formCtx.form.fields.set(toHubFormInput(refreshed.data))
      }
    },
  }),
}))

const formCtx = $derived(configuredHubForm())
const isRequiredInPreflight = createSchemaRequiredInferer(HubPreflightFormData)
const isDirty = $derived(Boolean(formCtx.dirty))

const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

const formLevelIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => isFormLevelIssue(issue))
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))
  return Array.from(new Set(messages))
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

const organisationSectionIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      return Array.isArray(path) && path[0] === 'data' && path[1] === 'organisations'
    })
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))
  return Array.from(new Set(messages))
})

const hubLayerSectionIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      return Array.isArray(path) && path[0] === 'data' && path[1] === 'layerDefaults'
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

// GLOBAL PROPERTIES

const hubPropertyFormAdapter = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{ properties?: Property[] }>,
)

function createPropertyActions(getCount: () => number) {
  return {
    add: (event: Event): void => {
      stopEvent(event)
      if (!headerCtrl.state.isEditing && canSubmitHub) {
        headerCtrl.setEditing(true)
      }
      addProjectPropertyForType(
        hubPropertyFormAdapter,
        'classifier',
        '',
        classifierComponentTypes,
        specifierComponentTypes,
        {
          projectId: null,
          hubId: hub?.data?.id ?? null,
          scope: 'hub',
          isDefaultEnabled: false,
        },
      )
      revalidateAfterProgrammaticChange()
    },
    remove: (event: Event, propertyId: Id): void => {
      stopEvent(event)
      removeProjectProperty(hubPropertyFormAdapter, propertyId)
      if (getCount() <= 1) fieldRemoveMode = false
      revalidateAfterProgrammaticChange()
    },
    increaseRank: async (event: Event, propertyId: Id): Promise<void> => {
      stopEvent(event)
      await scrollWithMovedProperty(
        propertyId,
        () => {
          changeProjectPropertyRankUnified(hubPropertyFormAdapter, propertyId, 'up')
        },
        async () => {
          await tick()
          await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
        },
      )
      revalidateAfterProgrammaticChange()
    },
    decreaseRank: async (event: Event, propertyId: Id): Promise<void> => {
      stopEvent(event)
      await scrollWithMovedProperty(
        propertyId,
        () => {
          changeProjectPropertyRankUnified(hubPropertyFormAdapter, propertyId, 'down')
        },
        async () => {
          await tick()
          await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
        },
      )
      revalidateAfterProgrammaticChange()
    },
  }
}

let fieldRemoveMode = $state(false)

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
  updateProjectPropertyBase(hubPropertyFormAdapter, propertyId, key, value)
  revalidateAfterProgrammaticChange()
}

const updatePropertyI18n = (
  propertyId: Id,
  locale: Locale,
  key: 'label' | 'placeholder' | 'labelGen' | 'placeholderGen',
  value: string | boolean,
): void => {
  updateProjectPropertyI18n(hubPropertyFormAdapter, propertyId, locale, key, value)
  revalidateAfterProgrammaticChange()
}

const addPropertyValue = (propertyId: Id): void => {
  addProjectPropertyValue(hubPropertyFormAdapter, propertyId)
  revalidateAfterProgrammaticChange()
}

const removePropertyValue = (propertyId: Id, valueId: Id): void => {
  removeProjectPropertyValue(hubPropertyFormAdapter, propertyId, valueId)
  revalidateAfterProgrammaticChange()
}

const movePropertyValue = (propertyId: Id, valueId: Id, targetIndex: number): void => {
  reorderProjectPropertyValue(hubPropertyFormAdapter, propertyId, valueId, targetIndex)
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
    hubPropertyFormAdapter,
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
  updateProjectPropertyValue(hubPropertyFormAdapter, propertyId, valueId, key, value)
  revalidateAfterProgrammaticChange()
}

const onTranslatePropertyLocale = async (
  propertyId: Id,
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> => {
  const translated = await translateProjectPropertyLocale(
    hubPropertyFormAdapter,
    propertyId,
    sourceLocale,
    targetLocale,
  )
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

const onResetPropertyLocale = (propertyId: Id, targetLocale: Locale): void => {
  resetProjectPropertyLocale(hubPropertyFormAdapter, propertyId, targetLocale)
  revalidateAfterProgrammaticChange()
}

const hubFieldsInSection = $derived(
  [...getCurrentProjectProperties(hubPropertyFormAdapter)].sort(
    (left, right) => (left.rank ?? 0) - (right.rank ?? 0),
  ),
)

const fieldActions = createPropertyActions(() => hubFieldsInSection.length)

const propertyFormIssues = $derived.by(
  (): Array<{ message: string; path?: Array<string | number> }> =>
    getPropertyFormIssues(visibleAllIssues),
)

const fieldSectionIssues = $derived.by(() => {
  const messages = propertyFormIssues.map(issue => issue.message).filter(Boolean)
  return Array.from(new Set(messages))
})

const fieldSectionIssueItemIds = $derived.by(() => {
  const properties = getCurrentProjectProperties(hubPropertyFormAdapter)
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

function resolveHubPropertyTypeTag(property: Property): {
  label?: string
  title?: string
  tone: 'global' | 'hub' | 'org' | 'project'
  iconComponent?: typeof Blend
} {
  return property.type === 'classifier'
    ? {
        tone: 'hub',
        title: m.admin__forms_common_categorical_field(),
        iconComponent: Blend,
      }
    : {
        tone: 'hub',
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

const hubUserRoles = $derived.by(() => {
  const baseRoles = (hub?.data?.userRoles ?? []) as HubRoleUser[]
  const roleByUserId = new Map(formUserRoleValues.map(role => [role.userId, role.role]))

  return formUserRoleValues.flatMap(formUserRole => {
    const baseRole = baseRoles.find(userRole => userRole.userId === formUserRole.userId)
    if (baseRole) {
      return [
        { ...baseRole, role: roleByUserId.get(formUserRole.userId) ?? baseRole.role },
      ]
    }

    const selectedUser = selectedUsersById[formUserRole.userId]
    if (!selectedUser) return []

    return [
      {
        hubId: hub?.data?.id ?? '',
        userId: formUserRole.userId,
        role: formUserRole.role as HubRoleUser['role'],
        user: {
          id: selectedUser.id,
          name: selectedUser.name,
          image: selectedUser.image,
          attribution: selectedUser.attribution,
        },
      } as HubRoleUser,
    ]
  })
})

// ORGANISATIONS

const formOrganisationValues = $derived(
  (formCtx.form.fields.value().data?.organisations ?? []) as Array<{
    organisationId: string
    isCoreInclusive: boolean
    isHubExclusive: boolean
  }>,
)
const formLayerDefaultValues = $derived(
  (formCtx.form.fields.value().data?.layerDefaults ?? []) as Array<{
    hubId: string
    layerId: string
    isDefaultVisible: boolean
  }>,
)
const organisationResolverForm = $derived(
  formCtx.form as unknown as HubOrganisationFieldNameResolverForm,
)
const hiddenOrganisationInputAttrs = $derived(
  getHubOrganisationHiddenInputAttrs(organisationResolverForm, formOrganisationValues),
)
const hiddenLayerDefaultInputAttrs = $derived(
  getHubLayerDefaultHiddenInputAttrs(
    formCtx.form,
    formLayerDefaultValues.map(item => ({
      hubId: item.hubId,
      layerId: item.layerId,
      isDefaultVisible: item.isDefaultVisible,
    })),
  ),
)

const hubOrganisations = $derived.by(() => {
  const baseById = new Map(
    (hub?.data?.organisations ?? []).map((org: any) => [org.id, org]),
  )

  return formOrganisationValues.flatMap(selection => {
    const baseOrganisation = baseById.get(selection.organisationId)
    if (baseOrganisation) {
      return [
        {
          ...baseOrganisation,
          isCoreInclusive: selection.isCoreInclusive,
          isHubExclusive: selection.isHubExclusive,
        },
      ]
    }

    const selectedOrganisation = selectedOrganisationsById[selection.organisationId]
    if (!selectedOrganisation) return []

    return [
      {
        ...selectedOrganisation,
        hubId: hub?.data?.id ?? null,
        isCoreInclusive: selection.isCoreInclusive,
        isHubExclusive: selection.isHubExclusive,
      },
    ]
  }) as Array<Record<string, unknown>>
})

const hubLayerItems = $derived.by(() => {
  const localeKey = getLocaleKey()
  const selectedOrganisationIds = new Set(
    formOrganisationValues.map(item => item.organisationId),
  )
  const defaultByLayerId = new Map(
    formLayerDefaultValues.map(item => [item.layerId, item.isDefaultVisible]),
  )

  return adminCtx.appCtx.state.resources.layer
    .filter(
      layer => !layer.isArchived && selectedOrganisationIds.has(layer.organisationId),
    )
    .map(layer => {
      const project = adminCtx.appCtx.getResourceByIdSync(
        FirstClassResource.project,
        layer.projectId,
      )
      return {
        id: layer.id,
        projectNameShort: project?.i18n?.[localeKey]?.nameShort ?? project?.code ?? '-',
        layerName: layer.i18n?.[localeKey]?.name ?? layer.id,
        isDefaultVisible: Boolean(defaultByLayerId.get(layer.id)),
      }
    })
    .sort((left, right) =>
      `${left.projectNameShort} ${left.layerName}`.localeCompare(
        `${right.projectNameShort} ${right.layerName}`,
      ),
    )
})

// IMAGE

const activeHubImage = $derived((hub?.data?.image ?? null) as ImageCtxEnvelope | null)
const imageProviderProps = $derived.by(() => {
  const hubData = hub?.data
  const isValid = isCurrentRefLoaded && Boolean(hubData?.id)

  return {
    isAdminMode: true,
    isValid,
    image: isValid ? activeHubImage : undefined,
    context: isValid
      ? {
          ctxType: ImageContextResource.hub,
          ctxId: hubData?.id,
          hub: hubData,
        }
      : undefined,
  }
})

// § Auth

const currentUser = $derived(adminCtx.appCtx.getUser())
const currentActor = $derived(toHubAuthActor(currentUser))
const hubPermissions = $derived.by(() =>
  resolveHubActionPermissions(
    currentActor,
    hub?.data
      ? {
          resourceId: hub.data.id,
          resourceHubId: hub.data.id,
        }
      : {
          resourceHubId: undefined,
        },
    ['code'],
  ),
)

const canCreateHub = $derived(hubPermissions.canCreate)
const canEditHub = $derived(hubPermissions.canEdit)
const canPublishHub = $derived(hubPermissions.canPublish)
const canDeleteHub = $derived(hubPermissions.canDelete)
const canSubmitHub = $derived(isNewHubRef ? canCreateHub : canEditHub)
const canEditImagePresentationMode = $derived(
  canSubmitHub && isCurrentRefLoaded && !hub?.data?.isArchived,
)
const canEditImageDropzone = $derived(
  canEditHub && isCurrentRefLoaded && !hub?.data?.isArchived,
)
const canSetCoreInclusive = $derived(canSubmitHub)
const allowedOrganisationIds = $derived.by(() => {
  if (adminCtx.appCtx.isSuperAdmin()) return null
  const user = adminCtx.appCtx.getUser()
  const roles =
    user && typeof user === 'object' && 'roles' in user && Array.isArray(user.roles)
      ? (user.roles as UserRoleDisco[])
      : []
  const ids = roles
    .filter(role => role.type === 'organisation')
    .map(role => role.organisationId)
  return ids.length > 0 ? ids : []
})
const allowedOrganisationIdSet = $derived(new Set(allowedOrganisationIds ?? []))

// § Handlers

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

function onAddUser(user: User): void {
  selectedUsersById[user.id] = user
  hub = addUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: hub,
    user,
    defaultRole: HubRoleType.admin,
    foreignKey: 'hubId',
  })
  revalidateAfterProgrammaticChange()
}

function onRemoveUser(userId: string): void {
  const { [userId]: _removed, ...rest } = selectedUsersById
  selectedUsersById = rest
  hub = removeUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: hub,
    userId,
  })
  revalidateAfterProgrammaticChange()
}

function onRoleChange(userId: string, role: HubRoleType): void {
  hub = updateUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: hub,
    userId,
    role,
  })
  revalidateAfterProgrammaticChange()
}

function onAddOrganisation(organisation: any): void {
  if (allowedOrganisationIds && !allowedOrganisationIdSet.has(organisation.id)) return
  selectedOrganisationsById[organisation.id] = organisation
  updateFormData(formCtx.form, (data: any) => {
    const existing = data.organisations ?? []
    if (existing.some((item: any) => item.organisationId === organisation.id))
      return data
    data.organisations = [
      ...existing,
      {
        organisationId: organisation.id,
        isCoreInclusive: true,
        isHubExclusive: false,
      },
    ]
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onRemoveOrganisation(organisationId: string): void {
  const { [organisationId]: _removed, ...rest } = selectedOrganisationsById
  selectedOrganisationsById = rest
  updateFormData(formCtx.form, (data: any) => {
    data.organisations = (data.organisations ?? []).filter(
      (item: any) => item.organisationId !== organisationId,
    )
    const remainingOrganisationIds = new Set(
      data.organisations.map((item: any) => item.organisationId),
    )
    data.layerDefaults = (data.layerDefaults ?? []).filter((item: any) => {
      const layer = adminCtx.appCtx.getResourceByIdSync(
        FirstClassResource.layer,
        item.layerId,
      )
      return layer ? remainingOrganisationIds.has(layer.organisationId) : false
    })
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleCoreInclusive(organisationId: string, nextValue: boolean): void {
  if (!canSetCoreInclusive) return
  updateFormData(formCtx.form, (data: any) => {
    data.organisations = (data.organisations ?? []).map((item: any) =>
      item.organisationId === organisationId
        ? { ...item, isCoreInclusive: nextValue }
        : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleHubExclusive(organisationId: string, nextValue: boolean): void {
  updateFormData(formCtx.form, (data: any) => {
    data.organisations = (data.organisations ?? []).map((item: any) =>
      item.organisationId === organisationId
        ? { ...item, isHubExclusive: nextValue }
        : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleLayerDefault(layerId: string, nextValue: boolean): void {
  updateFormData(formCtx.form, (data: any) => {
    const currentHubId = hub?.data?.id ?? committedHub?.data?.id
    if (!currentHubId) return data

    const existing = data.layerDefaults ?? []
    const index = existing.findIndex((item: any) => item.layerId === layerId)

    if (index === -1) {
      data.layerDefaults = [
        ...existing,
        {
          hubId: currentHubId,
          layerId,
          isDefaultVisible: nextValue,
        },
      ]
      return data
    }

    data.layerDefaults = existing.map((item: any) =>
      item.layerId === layerId
        ? { ...item, hubId: currentHubId, isDefaultVisible: nextValue }
        : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

const hubFacetOrder = $derived.by(
  () =>
    getAdminFacetOrderForResource(
      FirstClassResource.hub,
      resolvedFacetTabs,
    ) as HubFacet[],
)

const buildFacetNavAction = createFacetNavActionBuilder<HubFacet>({
  resourceType: FirstClassResource.hub,
  getFacetOrder: () => hubFacetOrder,
  getActiveFacet: () => activeFacet as HubFacet,
  navigateToFacet: facet =>
    navigateOnAdmin(adminCtx, FirstClassResource.hub, hubRef, facet),
})

async function onSearchOrganisations(query: string): Promise<any[]> {
  if (Array.isArray(allowedOrganisationIds) && allowedOrganisationIds.length === 0) {
    return []
  }
  const result = await getOrganisations({
    q: query,
    conditions: adminCtx.appCtx.isSuperAdmin()
      ? {
          isArchived: false,
        }
      : {
          id: allowedOrganisationIds,
          isArchived: false,
        },
    prisms: adminCtx.appCtx.state.prisms,
    meta: { isAdminRequest: true, profile: 'admin' },
  })

  const currentHubId = hub?.data?.id ?? null
  return result.data.map(organisation => {
    const assignedHubId =
      typeof organisation.hubId === 'string' ? organisation.hubId : null
    const assignedHubCode =
      typeof organisation.hub?.code === 'string' ? organisation.hub.code : null

    return {
      ...organisation,
      assignedHubCode,
      isAssignedToOtherHub: Boolean(assignedHubId && assignedHubId !== currentHubId),
    }
  })
}

async function refreshHub(ref: string = hubRef): Promise<HubGetState> {
  if (ref === NEW_REF) return null
  try {
    return await getHub({
      ref,
      refKey: 'code',
      meta: { isAdminRequest: true, profile: 'detail' },
    })
  } catch {
    return hub ?? committedHub ?? null
  }
}

async function handleHubStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
}: {
  field: 'isPublished' | 'isArchived'
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: typeof publishHub | typeof archiveHub
}): Promise<void> {
  const hubData = hub?.data
  if (!hubData) return

  const nextState = !hubData[field]
  setBusy(true)

  try {
    await mutate({
      id: hubData.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      getHub({
        ref: hubRef,
        refKey: 'code',
        meta: { isAdminRequest: true, profile: 'detail' },
      }).withOverride(overrideHubEntityBoolean(field, nextState)),
      getHubs({
        conditions: adminCtx.appCtx.isSuperAdmin()
          ? { isArchived: null, isPublished: null }
          : { isArchived: false, isPublished: null },
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(overrideHubListItemBoolean(hubData.id, field, nextState)),
    )

    commitSettledHubState(await refreshHub())
    toast.success(`${nextState ? successWhenTrue : successWhenFalse} ${hubData.code}`)
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

async function onPublishToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canPublishHub) return
  await handleHubStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishHub,
  })
}

async function onDeleteToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canDeleteHub) return
  await handleHubStateToggle({
    field: 'isArchived',
    successWhenTrue: m.bad_swift_cheetah_surge(),
    successWhenFalse: m.forms__restored(),
    setBusy: value => headerCtrl.setDeleting(value),
    mutate: archiveHub,
  })
}

function onReset(): void {
  fieldRemoveMode = false
  fieldsLayoutMutationVersion += 1
  suppressFormLevelIssues = true
  formCtx.clearSubmitAttemptState()
  if (committedHub?.data) {
    hub = committedHub
    formCtx.form.fields.set(toHubFormInput(committedHub.data))
    return
  }
  formCtx.reset()
}

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) return
  if (isNewHubRef) {
    formCtx.requestSubmit({ meta: { mode: 'create' } })
    return
  }
  const baseMeta = committedHub?.data
    ? (toHubFormInput(committedHub.data).meta ?? {})
    : undefined
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

function onPresentationModeCommitted(nextMode: 'cover' | 'contain'): void {
  if (!canEditImagePresentationMode) return
  setHubImagePresentationMode(hub, nextMode)
  setHubImagePresentationMode(committedHub, nextMode)
}

// § Effects

$effect(() => {
  hubRef
  const cachedCode = cachedHubState?.data?.code
  if (!cachedCode) return
  if (hub?.data?.code === cachedCode) return
  commitHubState(cachedHubState)
})

$effect(() => {
  hubRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  const resolvedFacetTabsSnapshot = untrack(() => resolvedFacetTabs)
  return resourceEditorPage.syncRouteAndLoad({
    ref: hubRef,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      settledHubRef = null
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet =
          currentFacet && resolvedFacetTabsSnapshot.has(currentFacet)
            ? currentFacet
            : 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.hub)
      })
    },
    load: refreshHub,
    commit: commitSettledHubState,
  })
})

$effect(() => {
  activeFacet
  contentsElement
  focusFacetFromHash(contentsElement, activeFacet)
})

$effect(() => {
  const title =
    (isNewHubRef ? `${NEW_TITLE} ${m.hub__title()}` : undefined) ??
    hub?.data?.i18n?.[getLocale()]?.name ??
    hub?.data?.code ??
    m.hub__title()
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
        .map(
          ([facet, config]) =>
            `${facet}:${typeof config === 'string' ? '0' : config.hasIssues ? '1' : '0'}`,
        )
        .join('|')
  const headerKey = `${hubRef}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  if (Array.isArray(displayFacets)) {
    headerCtrl.setHeaderForEntity(title, HubIcon, new Map())
    headerCtrl.setFacets(displayFacets)
    return
  }
  headerCtrl.setHeaderForEntity(title, HubIcon, displayFacets)
})

$effect(() => {
  if (!formCtx.wasSubmitAttempted) return
  if (visibleAllIssues.length === 0) return
  const targetFacet = facetIssueSummary.firstFacetWithIssues
  if (!targetFacet) return
  if (activeFacet === targetFacet) return
  adminCtx.setFacet(targetFacet, hubRef, FirstClassResource.hub)
})

$effect(() => {
  if (!hub?.data?.isArchived) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
})

$effect(() => {
  if (!isNewHubRef) return
  if (canCreateHub) return
  navigateOnAdmin(adminCtx, FirstClassResource.hub)
})

$effect(() => {
  if (!isNewHubRef) {
    hasAutoEnteredEditForNew = false
    return
  }
  if (!canSubmitHub) return
  if (hasAutoEnteredEditForNew) return
  if (headerCtrl.state.isEditing) return
  headerCtrl.setEditing(true)
  hasAutoEnteredEditForNew = true
})

$effect(() => {
  if (!isCurrentRefSettled && !isNewHubRef) return
  if (canSubmitHub) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
})

$effect(() => {
  resourceEditorPage.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    toggleDelete: onDeleteToggle,
  })
})

$effect(() => {
  const isImageFacetActive = isImagesFacet
  const status = resolveOptimisticHeaderStatus({
    isSettled: isCurrentRefSettled,
    isImageFacetActive,
    isNewRef: isNewHubRef,
    dirty: isDirty,
    isSubmitting: formCtx.submitting,
    hasIssues: visibleAllIssues.length > 0,
    isPublished: Boolean(hub?.data?.isPublished),
    isDeleted: Boolean(hub?.data?.isArchived),
    canEdit: canSubmitHub,
    canPublish: canPublishHub,
    showDeleteAction: !isNewHubRef && canDeleteHub,
    showPublishAction: !isNewHubRef,
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
    isReady={Boolean(formCtx.form?.fields && (hub?.data || isNewHubRef))}
  >
    <Main.Facet
      isVisible={isCoreFacet}
      transition={fade}
      fillHeight={true}
      previousAction={buildFacetNavAction('core', 'previous')}
      nextAction={buildFacetNavAction('core', 'next')}
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

      <GridSpacer cols={3} leftCols={1} centerCols={1} rightCols={1}>
        {#snippet left()}
          {@const roleFieldNameByUserId = getRoleFieldNameByUserId(userRoleResolverForm)}
          <FormUserRolesSection
            title={m.admin__forms_hub_admins_title()}
            subtitle={m.admin__forms_hub_admins_subtitle()}
            transitionEntityKey={hub?.data?.id ?? hubRef}
            removeSelfResourceLabel={m.resource__hub_singular()}
            issues={userRoleSectionIssues}
            userRoles={hubUserRoles}
            {roleFieldNameByUserId}
            {hiddenUserIdInputAttrs}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewHubRef}
            availableRoles={[{ value: HubRoleType.admin, label: 'Admin' }]}
            userQueryParams={{
              conditions: { isArchived: false },
            }}
            {onAddUser}
            {onRemoveUser}
            {onRoleChange}
          />
        {/snippet}

        {#snippet center()}
          <FormOrganisationsSection
            title={m.maps__organisations()}
            subtitle={m.hub__organisations_note()}
            issues={organisationSectionIssues}
            organisations={hubOrganisations}
            selections={formOrganisationValues}
            {hiddenOrganisationInputAttrs}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewHubRef}
            {canSetCoreInclusive}
            {onSearchOrganisations}
            {onAddOrganisation}
            {onRemoveOrganisation}
            {onToggleCoreInclusive}
            {onToggleHubExclusive}
          />
        {/snippet}

        {#snippet right()}
          <FormHubSpecifiersFields
            form={formCtx.form}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </GridSpacer>
    </Main.Facet>

    <Main.Facet
      isVisible={isLayersFacet}
      transition={fade}
      fillHeight={true}
      previousAction={buildFacetNavAction('layers', 'previous')}
      nextAction={buildFacetNavAction('layers', 'next')}
      attrs={{ 'data-facet-id': 'layers' }}
    >
      <FormHubLayersSection
        title={m.maps__layers()}
        subtitle={m.admin__forms_hub_layers_subtitle()}
        localeKey={getLocaleKey()}
        items={hubLayerItems}
        issues={hubLayerSectionIssues}
        {hiddenLayerDefaultInputAttrs}
        {isEditing}
        isSubmitting={formCtx.submitting}
        onToggleDefault={onToggleLayerDefault}
      />
    </Main.Facet>

    <Main.Facet
      isVisible={isFieldsFacet}
      transition={fade}
      fillHeight={true}
      class="bits-theme flex gap-4 min-h-0 flex-col"
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormFieldsSection
        items={hubFieldsInSection}
        title={m.admin__forms_common_fields()}
        description={m.admin__forms_common_fields_subtitle()}
        issues={fieldSectionIssues}
        actions={fieldActions}
        issueItemIds={fieldSectionIssueItemIds}
        layoutMutationVersion={fieldsLayoutMutationVersion}
        canEdit={canSubmitHub && isCurrentRefLoaded}
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
              getCurrentProjectProperties(hubPropertyFormAdapter).findIndex(
                candidate => candidate.id === propertyId,
              ),
            getPropertyFields: (_propertyId, propertyIndex) =>
              getProjectPropertyFieldsForIndex(formCtx.form, propertyIndex),
            resolveSourceTag: resolveHubPropertyTypeTag,
          }}
      />
    </Main.Facet>
  </Main.Form>

  <Main.Facet
    isVisible={isImagesFacet}
    transition={fade}
    fillHeight={true}
    navMode="footer"
    previousAction={buildFacetNavAction('images', 'previous')}
    nextAction={buildFacetNavAction('images', 'next')}
    attrs={{ 'data-facet-id': 'images' }}
  >
    <EntityImage
      {page}
      entityId={hub?.data?.id}
      {imageProviderProps}
      currentImage={activeHubImage}
      ctx={hub?.data?.id
          ? {
              ctxType: ImageContextResource.hub,
              ctxId: hub.data.id,
            }
          : undefined}
      canEditPresentationMode={canEditImagePresentationMode}
      canEditDropzone={canEditImageDropzone}
      {onPresentationModeCommitted}
    />
  </Main.Facet>
</Main.Root>
