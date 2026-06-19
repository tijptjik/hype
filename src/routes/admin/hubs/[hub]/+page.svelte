<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { tick, untrack } from 'svelte'
// I18N
import { m } from '$lib/i18n'
import { getI18n, getLocale, getLocaleKey, getLocaleOrder } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  applyChangedRelationField,
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getGenAiState,
  getEditorCtrl,
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
  syncAdminFacetFromHash,
  toggleGenAiField,
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
  createDefaultHubPrivacyPolicy,
  createDefaultHubTermsOfService,
} from '$lib/services/policy'
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
import { getLayers } from '$lib/api/server/layer.remote'
import { toHubAuthActor, resolveHubActionPermissions } from '$lib/api/services/authz'
import { getOrganisations } from '$lib/api/server/organisation.remote'
// SCHEMA
import { HubPreflightFormData } from '$lib/db/zod/schema/hub'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  FormFieldsSection,
  FormHubLayersSection,
  FormHubSpecifiersFields,
  FormHubSubscriptionSection,
  FormOrganisationsSection,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormUserRolesSection,
  GridSpacer,
  Main,
  ResourceViewer,
  TextArea,
} from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
import type { HubOrganisationItem } from '$lib/bits/patterns/forms/formOrganisationsSection/formOrganisationsSection.types'
// ADAPTERS
import { useImageProviderModel } from '$lib/adapters/image'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// COMPONENTS
import ImageProvider from '$lib/providers/ImageProvider.svelte'
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
import RefreshCw from 'virtual:icons/lucide/refresh-cw'
import Type from 'virtual:icons/lucide/type'
// ENUMS
import {
  classifierComponentTypes,
  FirstClassResource,
  HubRoleType,
  HubSubscriptionService,
  ImageContextResource,
  specifierComponentTypes,
} from '$lib/enums'
// TYPES
import type {
  Id,
  Locale,
  LocaleKey,
  User,
  UserRoleDisco,
  UserRoleFieldNameResolverForm,
  HubOrganisationFieldNameResolverForm,
  FormDataUpdaterForm,
  HeaderTransitionSnapshot,
  HubSubscriptionPlacement,
} from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type {
  Hub,
  HubFormInput,
  HubGetState,
  HubRoleUser,
} from '$lib/db/zod/schema/hub.types'
import type { LayerCardProfile } from '$lib/db/zod/schema/layer.types'

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

const editorCtrl = getEditorCtrl({
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
let lastSyncedFacetHash = $state('')

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let fieldsLayoutMutationVersion = $state(0)
let selectedUsersById = $state<Record<string, User>>({})
let selectedOrganisationsById = $state<Record<string, HubOrganisationItem>>({})
let hasAutoEnteredEditForNew = $state(false)
let settledHubRef = $state<string | null>(null)
let availableHubLayers = $state<LayerCardProfile[]>([])
let hubLayerRequestId = $state(0)
let lastHubLayerOrganisationKey = $state('')
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
const isPoliciesFacet = $derived(activeFacet === 'policies')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewHubRef = $derived(hubRef === NEW_REF)
const isCoreHub = $derived(Boolean(hub?.data?.isCore) || hubRef === 'core')

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewHubRef) return true
  return guardRefDesync(hub, committedHub, hubRef)
})
const isCurrentRefSettled = $derived(isNewHubRef || settledHubRef === hubRef)
const optimisticHubData = $derived.by(() =>
  isCurrentRefLoaded ? hub?.data : cachedHubForRef,
)

// § Form

const translatableI18nFieldsBySection = {
  descriptors: ['name', 'nameShort', 'description'],
  policies: ['privacyPolicy', 'termsOfService'],
} as const
type HubOrganisationSelection = NonNullable<
  HubFormInput['data']['organisations']
>[number]
type HubLayerDefaultSelection = NonNullable<
  HubFormInput['data']['layerDefaults']
>[number]

const configuredHubForm = configureForm<HubFormInput>(() => ({
  form: hubForm,
  onsubmit: (({ data }: { data: HubFormInput }) => {
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
    const currentFormSnapshot = formCtx.form.fields.value() as HubFormInput

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
  ...createResourceFormConfig<HubFormInput>({
    formEl: contentsElement,
    key: hubRef,
    schema: HubPreflightFormData,
    data: toHubFormInput(committedHub?.data),
    submitUpdates: async () =>
      getHubSubmitUpdates({
        hubId: hub?.data?.id,
        entityQuery: getHub({
          ref: hubRef,
          refKey: 'code',
          meta: { isAdminRequest: true, profile: 'admin' },
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

const hubEntityUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<HubFormInput['data']>,
)
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
const roleFieldNameByUserId = $derived(getRoleFieldNameByUserId(userRoleResolverForm))
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
const formSubscriptionPlacement = $derived(
  (formCtx.form.fields.value().data?.subscriptionPlacement ?? {
    hubPanel: false,
    topBar: false,
    menu: true,
  }) as HubSubscriptionPlacement,
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
    (hub?.data?.organisations ?? []).map(org => [org.id, org] as const),
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

  return availableHubLayers
    .filter(
      layer =>
        !layer.isArchived &&
        (isCoreHub || selectedOrganisationIds.has(layer.organisationId)),
    )
    .map(layer => {
      const project = adminCtx.appCtx.getResourceByIdSync(
        FirstClassResource.project,
        layer.projectId,
      )
      const organisation = adminCtx.appCtx.getResourceByIdSync(
        FirstClassResource.organisation,
        layer.organisationId,
      )
      return {
        id: layer.id,
        organisationId: layer.organisationId,
        organisationName:
          getI18n(organisation, 'name', adminCtx.appCtx.getUserPreferences()) ??
          organisation?.code ??
          layer.organisationId,
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

$effect(() => {
  const organisationIds = isCoreHub
    ? []
    : Array.from(
        new Set(
          formOrganisationValues.map(item => item.organisationId).filter(Boolean),
        ),
      ).sort()
  const organisationKey = organisationIds.join('|')
  const isSuperAdmin = adminCtx.appCtx.isSuperAdmin()
  const requestKey = `${isCoreHub ? 'core' : 'scoped'}:${isSuperAdmin ? 'super' : 'admin'}:${organisationKey}`

  if (lastHubLayerOrganisationKey === requestKey) return
  lastHubLayerOrganisationKey = requestKey

  if (!isCoreHub && organisationIds.length === 0) {
    if (availableHubLayers.length > 0) {
      availableHubLayers = []
    }
    hubLayerRequestId += 1
    return
  }

  const currentRequestId = ++hubLayerRequestId

  void untrack(() =>
    getLayers({
      conditions: isSuperAdmin
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      prisms: isCoreHub ? undefined : { organisation: organisationIds },
      meta: { isAdminRequest: true, profile: 'card' },
    })
      .then(result => {
        if (currentRequestId !== hubLayerRequestId) return
        availableHubLayers = Array.isArray(result?.data) ? result.data : []
      })
      .catch(() => {
        if (currentRequestId !== hubLayerRequestId) return
        availableHubLayers = []
      }),
  )
})

// IMAGE

const optimisticHubImage = $derived(
  (optimisticHubData?.image ?? null) as ImageCtxEnvelope | null,
)
const imageProviderProps = $derived.by(() => {
  const hubData = optimisticHubData
  const isValid = Boolean(hubData?.id)

  return {
    isAdminMode: true,
    isValid,
    image: isValid ? optimisticHubImage : undefined,
    context: isValid
      ? {
          ctxType: ImageContextResource.hub,
          ctxId: hubData?.id,
          hub: hubData,
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

function getPolicyFields(locale: LocaleKey) {
  return formCtx.form.fields.data.i18n[locale]
}

function getPolicyTextareaAttrs(
  locale: LocaleKey,
  field: 'privacyPolicy' | 'termsOfService',
): Record<string, unknown> {
  return getPolicyFields(locale)[field].as('textarea') as Record<string, unknown>
}

function getPolicyGenValue(
  locale: LocaleKey,
  field: 'privacyPolicy' | 'termsOfService',
): boolean {
  return getGenAiState(formCtx.form, locale, field)
}

function getPolicyGenAttrs(
  locale: LocaleKey,
  field: 'privacyPolicyGen' | 'termsOfServiceGen',
  value: boolean,
): Record<string, unknown> {
  return getPolicyFields(locale)[field].as(
    'hidden',
    value ? 'true' : 'false',
  ) as Record<string, unknown>
}

function revalidateAfterProgrammaticChange(): void {
  revalidateAfterSubmitAttempt({
    wasSubmitAttempted: formCtx.wasSubmitAttempted,
    validate: formCtx.validate,
  })
}

async function onTranslate(
  sourceLocale: LocaleKey,
  targetLocale: LocaleKey,
  sectionKey?: string,
): Promise<boolean> {
  const fields =
    sectionKey === 'policies'
      ? translatableI18nFieldsBySection.policies
      : translatableI18nFieldsBySection.descriptors
  const translated = await translateLocaleIntoEmptyFields({
    form: formCtx.form,
    sourceLocale,
    targetLocale,
    fields: [...fields],
  })
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

function onResetLocale(targetLocale: LocaleKey, sectionKey?: string): void {
  const fields =
    sectionKey === 'policies'
      ? translatableI18nFieldsBySection.policies
      : translatableI18nFieldsBySection.descriptors
  resetLocaleFields({
    form: formCtx.form,
    targetLocale,
    fields: [...fields],
  })
  revalidateAfterProgrammaticChange()
}

function onRegeneratePolicies(): void {
  updateFormData(hubEntityUpdaterForm, data => {
    const legalContactAddress = data.legalContactAddress ?? ''
    const localesToUpdate: Array<'en' | 'zhHans' | 'zhHant'> = [
      'en',
      'zhHans',
      'zhHant',
    ]

    for (const localeKey of localesToUpdate) {
      const locale = data.i18n?.[localeKey]
      if (!locale) continue

      locale.privacyPolicy = createDefaultHubPrivacyPolicy(
        localeKey,
        locale.name,
        locale.nameShort,
        legalContactAddress,
      )
      locale.privacyPolicyGen = true
      locale.termsOfService = createDefaultHubTermsOfService(
        localeKey,
        locale.name,
        locale.nameShort,
        legalContactAddress,
      )
      locale.termsOfServiceGen = true
    }

    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleSubscriptionAvailability(nextValue: boolean): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.isSubscriptionAvailable = nextValue
    if (!data.subscriptionService) {
      data.subscriptionService = HubSubscriptionService.substack
    }
    if (!data.subscriptionPlacement) {
      data.subscriptionPlacement = {
        hubPanel: false,
        topBar: false,
        menu: true,
      }
    }
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onSubscriptionServiceChange(nextValue: HubSubscriptionService): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.subscriptionService = nextValue
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onSubscriptionIdChange(nextValue: string): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.subscriptionId = nextValue
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onSubscriptionSessionCookieChange(nextValue: string): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.subscriptionSessionCookie = nextValue
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onSubscriptionBenefitsChange(
  localeKey: 'en' | 'zhHans' | 'zhHant',
  nextValue: string,
): void {
  updateFormData(hubEntityUpdaterForm, data => {
    if (!data.i18n?.[localeKey]) return data
    data.i18n[localeKey].subscriptionBenefits = nextValue
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleSubscriptionPlacement(
  key: keyof HubSubscriptionPlacement,
  nextValue: boolean,
): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.subscriptionPlacement = {
      hubPanel: Boolean(data.subscriptionPlacement?.hubPanel),
      topBar: Boolean(data.subscriptionPlacement?.topBar),
      menu:
        typeof data.subscriptionPlacement?.menu === 'boolean'
          ? data.subscriptionPlacement.menu
          : true,
      [key]: nextValue,
    }
    return data
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

function onAddOrganisation(organisation: HubOrganisationItem): void {
  if (allowedOrganisationIds && !allowedOrganisationIdSet.has(organisation.id)) return
  selectedOrganisationsById[organisation.id] = organisation
  updateFormData(hubEntityUpdaterForm, data => {
    const existing = data.organisations ?? []
    if (
      existing.some(
        (item: HubOrganisationSelection) => item.organisationId === organisation.id,
      )
    )
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
  updateFormData(hubEntityUpdaterForm, data => {
    data.organisations = (data.organisations ?? []).filter(
      (item: HubOrganisationSelection) => item.organisationId !== organisationId,
    )
    const remainingOrganisationIds = new Set(
      data.organisations.map((item: HubOrganisationSelection) => item.organisationId),
    )
    data.layerDefaults = (data.layerDefaults ?? []).filter(
      (item: HubLayerDefaultSelection) => {
        const layer = adminCtx.appCtx.getResourceByIdSync(
          FirstClassResource.layer,
          item.layerId,
        )
        return layer ? remainingOrganisationIds.has(layer.organisationId) : false
      },
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleCoreInclusive(organisationId: string, nextValue: boolean): void {
  if (!canSetCoreInclusive) return
  updateFormData(hubEntityUpdaterForm, data => {
    data.organisations = (data.organisations ?? []).map(
      (item: HubOrganisationSelection) =>
        item.organisationId === organisationId
          ? { ...item, isCoreInclusive: nextValue }
          : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleHubExclusive(organisationId: string, nextValue: boolean): void {
  updateFormData(hubEntityUpdaterForm, data => {
    data.organisations = (data.organisations ?? []).map(
      (item: HubOrganisationSelection) =>
        item.organisationId === organisationId
          ? { ...item, isHubExclusive: nextValue }
          : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleLayerDefault(layerId: string, nextValue: boolean): void {
  updateFormData(hubEntityUpdaterForm, data => {
    const currentHubId = hub?.data?.id ?? committedHub?.data?.id
    if (!currentHubId) return data

    const existing = data.layerDefaults ?? []
    const index = existing.findIndex(
      (item: HubLayerDefaultSelection) => item.layerId === layerId,
    )

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

    data.layerDefaults = existing.map((item: HubLayerDefaultSelection) =>
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

$effect(() => {
  const currentHash = page.url.hash
  if (currentHash === lastSyncedFacetHash) return
  lastSyncedFacetHash = currentHash
  syncAdminFacetFromHash({
    hash: currentHash,
    activeFacet,
    facetOrder: hubFacetOrder,
    adminCtx,
    resourceType: FirstClassResource.hub,
    resourceRef: hubRef,
  })
})

bindAdminFacetHistorySync({
  getFacetOrder: () => hubFacetOrder,
  getActiveFacet: () => adminCtx.activeFacet as HubFacet | false,
  adminCtx,
  resourceType: FirstClassResource.hub,
  getResourceRef: () => hubRef,
})

async function onSearchOrganisations(query: string): Promise<HubOrganisationItem[]> {
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
  const organisations = Array.isArray(result?.data) ? result.data : []

  return organisations.map(organisation => {
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
      meta: { isAdminRequest: true, profile: 'admin' },
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
  return editorCtrl.syncRouteAndLoad({
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
    hub?.data?.i18n?.[getLocaleKey()]?.name ??
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
  editorCtrl.wireHeaderHandlers({
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
    isReady={Boolean(formCtx.form?.fields && (hub?.data || isNewHubRef))}
  >
    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
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

        <!-- biome-ignore lint/correctness/noUnusedFunctionParameters: Biome misreads Svelte snippet parameters used in markup. -->
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
        {#snippet right()}
          <FormUserRolesSection
            title={m.admin__forms_hub_admins_title()}
            subtitle={m.admin__forms_hub_admins_subtitle()}
            minCardWidth={250}
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
          <FormHubSubscriptionSection
            form={formCtx.form}
            {isEditing}
            isSubscriptionAvailable={Boolean(
                formCtx.form.fields.value().data?.isSubscriptionAvailable,
              )}
            subscriptionService={(formCtx.form.fields.value().data
                ?.subscriptionService ??
                HubSubscriptionService.substack) as HubSubscriptionService}
            subscriptionId={String(formCtx.form.fields.value().data?.subscriptionId ?? '')}
            subscriptionSessionCookie={String(
                formCtx.form.fields.value().data?.subscriptionSessionCookie ?? '',
              )}
            subscriptionBenefitsByLocale={{
                en: String(
                  formCtx.form.fields.value().data?.i18n?.en?.subscriptionBenefits ?? '',
                ),
                zhHans: String(
                  formCtx.form.fields.value().data?.i18n?.zhHans?.subscriptionBenefits ??
                    '',
                ),
                zhHant: String(
                  formCtx.form.fields.value().data?.i18n?.zhHant?.subscriptionBenefits ??
                    '',
                ),
              }}
            subscriptionPlacement={formSubscriptionPlacement}
            onAvailabilityChange={onToggleSubscriptionAvailability}
            onServiceChange={onSubscriptionServiceChange}
            {onSubscriptionIdChange}
            {onSubscriptionSessionCookieChange}
            {onSubscriptionBenefitsChange}
            onPlacementChange={onToggleSubscriptionPlacement}
          />
        {/snippet}

        {#snippet left()}
          {#if !isCoreHub}
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
          {/if}
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
      transition="fade"
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
      transition="fade"
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

    <Main.Facet
      isVisible={isPoliciesFacet}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('policies', 'previous')}
      nextAction={buildFacetNavAction('policies', 'next')}
      attrs={{ 'data-facet-id': 'policies' }}
    >
      <FormI18nSection
        title="Policies"
        subtitle="Configure the privacy policy and terms of service shown for this hub."
        {locales}
        {onTranslate}
        {onResetLocale}
        actions={[
          {
            text: 'Regenerate',
            iconComponent: RefreshCw,
            hideLabel: false,
            hideLabelBelow: 0,
            size: 'sm',
            style: 'ghost',
            onClick: () => {
              onRegeneratePolicies()
            },
            disabled: !isEditing,
          },
        ]}
        sectionKey="policies"
        {isEditing}
      >
        <!-- biome-ignore lint/correctness/noUnusedFunctionParameters: Biome misreads Svelte snippet parameters used in markup. -->
        {#snippet children(locale)}
          <input
            {...getPolicyGenAttrs(
              locale,
              'privacyPolicyGen',
              getPolicyGenValue(locale, 'privacyPolicy'),
            )}
          >
          <input
            {...getPolicyGenAttrs(
              locale,
              'termsOfServiceGen',
              getPolicyGenValue(locale, 'termsOfService'),
            )}
          >

          <TextArea
            label="Privacy Policy"
            {locale}
            isTranslated={true}
            {isEditing}
            isGenAI={getPolicyGenValue(locale, 'privacyPolicy')}
            onToggleGenAI={() => toggleGenAiField(formCtx.form, locale, 'privacyPolicy')}
            value={(getPolicyTextareaAttrs(locale, 'privacyPolicy') as { value?: string }).value ?? ''}
            issues={getPolicyFields(locale).privacyPolicy.issues()}
            rows={24}
            textareaAttrs={getPolicyTextareaAttrs(locale, 'privacyPolicy')}
          />

          <TextArea
            label="Terms Of Service"
            {locale}
            isTranslated={true}
            {isEditing}
            isGenAI={getPolicyGenValue(locale, 'termsOfService')}
            onToggleGenAI={() =>
              toggleGenAiField(formCtx.form, locale, 'termsOfService')}
            value={(getPolicyTextareaAttrs(locale, 'termsOfService') as { value?: string })
                .value ?? ''}
            issues={getPolicyFields(locale).termsOfService.issues()}
            rows={20}
            textareaAttrs={getPolicyTextareaAttrs(locale, 'termsOfService')}
          />
        {/snippet}
      </FormI18nSection>
    </Main.Facet>
  </Main.Form>

  <Main.Facet
    isVisible={isImagesFacet}
    transition="fade"
    fillHeight={true}
    edgeToEdge={true}
    attrs={{ 'data-facet-id': 'images' }}
  >
    {#if imageProviderProps.isValid}
      <ImageProvider model={imageProviderModel}>
        <ResourceViewer
          canEditPresentationMode={canEditImagePresentationMode}
          canEditDropzone={canEditImageDropzone}
          {onPresentationModeCommitted}
        />
      </ImageProvider>
    {:else}
      <div
        class="flex h-full w-full items-center justify-center p-6 text-center text-sm text-base-content/65"
      >
        {m.admin__forms_hub_image_save_hint()}
      </div>
    {/if}
  </Main.Facet>
</Main.Root>
