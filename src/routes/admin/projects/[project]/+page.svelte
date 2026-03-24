<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { tick, untrack } from 'svelte'
// ENUMS
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types'
// I18N
import { m } from '$lib/i18n'
import { getI18n, getLocaleKey, getLocaleOrder, toLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  buildProjectLicense,
  createDefaultProjectLicense,
  getProjectLicenseIntent,
  isCustomProjectLicense,
  normalizeProjectLicense as normalizeSharedProjectLicense,
  projectLicenseLeafMediaTypes,
  type ProjectLicenseIntent,
} from '$lib/client/services/licence'
import {
  addUserRoleSelection,
  applyChangedRelationField,
  bindAdminFacetHistorySync,
  captureHeaderTransitionSnapshot,
  createFacetNavActionBuilder,
  createResourceFormConfig,
  focusFacetFromHash,
  getEditorCtrl,
  guardRefDesync,
  prepareSubmitPayloadMeta,
  revalidateAfterSubmitAttempt,
  removeUserRoleSelection,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  resetLocaleFields,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
} from '$lib/client/services/form'
import {
  createMapRenderTitleMenuItem,
  refreshMapRender,
} from '$lib/client/services/map'
import { getNameForToast } from '$lib/client/services/resource'
import {
  getCapabilityKeysFromDefinitions,
  getCapabilityLabel,
  normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
import {
  getProjectSubmitUpdates,
  normalizeProjectCapabilitiesForSubmit,
  normalizeProjectLayersForSubmit,
  normalizePropertiesForSubmit,
  overrideProjectEntityBoolean,
  overrideProjectListItemBoolean,
  resolveProjectCapabilityDefinitionState,
  resolveProjectCapabilitySourceOrganisationId,
  resolveDefaultProjectOrganisationIdForCreate,
  seedOwnerRolesForNewProject as resolveOwnerRoleSeedForNewProject,
  toComparableProjectUserRolesForSubmit,
  toDenseProperties,
  toProjectCapabilitiesAndRolesForToggle,
  toStableSignature,
  toUserRolesForCapabilityToggle,
  toUserRolesWithRoleChange,
  toProjectFormInput,
} from '$lib/client/services/project'
import {
  addProjectPropertyForType,
  changeProjectPropertyRankUnified,
  getCurrentProjectProperties,
  getPropertyFormIssues,
  getProjectPropertyFieldsForIndex,
  removeProjectProperty,
  resetProjectPropertyLocale,
  scrollWithMovedProperty,
  sortProjectPropertyValuesAlphabetically,
  stopEvent,
  translateProjectPropertyLocale,
  updateProjectPropertyValue,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  updateProjectPropertyValueI18n,
  addProjectPropertyValue,
  removeProjectPropertyValue,
  reorderProjectPropertyValue,
} from '$lib/client/services/property'
import { setProjectImagePresentationMode } from '$lib/client/services/image'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveProject,
  getProject,
  getProjectMapStyles,
  getProjects,
  projectForm,
  publishProject,
} from '$lib/api/server/project.remote'
import { getLayers } from '$lib/api/server/layer.remote'
import { getFeatures } from '$lib/api/server/feature.remote'
import { getOrganisation, getOrganisations } from '$lib/api/server/organisation.remote'
// SCHEMA
import { ProjectPreflightFormData } from '$lib/db/zod/schema/project'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  EntityImage,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormMapStyleSection,
  FormParentSection,
  FormProjectLicenseSection,
  FormProjectLayersSection,
  FormSpecifiersFields,
  FormFieldsSection,
  ProjectCapabilities,
  FormUserRolesSection,
  GridSpacer,
  Main,
} from '$lib/bits'

import type { ParentSectionOrganisationItem } from '$lib/bits/patterns/forms/formParentSection'
import type { MapStyleSelectionItem } from '$lib/bits/patterns/forms/formMapStyleSection'
import type { UserCapabilityMatrixRow } from '$lib/bits/patterns/capabilities/userCapabilityMatrix'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// NAVIGATION
import {
  getAdminFacetOrderForResource,
  getAdminFacetTabsForResource,
  navigateOnAdmin,
} from '$lib/navigation'
import type { ProjectFacet } from '$lib/navigation'
// AUTHZ
import {
  authorizeProjectDelete,
  authorizeProjectPublish,
  authorizeProjectUpdate,
  canCreateAnyProject,
  canSetProjectParentOrganisation,
  resolveProjectParentOrganisationScope,
  toProjectAuthActor,
} from '$lib/api/services/authz'
// UTILS
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
// ICONS
import Blend from 'virtual:icons/lucide/blend'
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
import Type from 'virtual:icons/lucide/type'
// ENUMS
import { FirstClassResource, ImageContextResource, ProjectRoleType } from '$lib/enums'
// TYPES
import type {
  CapabilityDefinitions,
  CapabilityKey,
  FormDataUpdaterForm,
  HeaderTransitionSnapshot,
  Locale,
  ResourceContext,
  UserRoleFieldNameResolverForm,
  Id,
  ProjectLicense,
  ProjectLicenseRights,
  ProjectLicenseMediaType,
} from '$lib/types'
import type { ImageCtxEnvelope } from '$lib/db/zod/schema/image.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { User } from '$lib/db/zod/schema/user.types'
import type { OrganisationGetState } from '$lib/db/zod/schema/organisation.types'
import type {
  ProjectBooleanField,
  ProjectCurrentFormDraft,
  ProjectFormInput,
  ProjectGetResponse,
  ProjectOwnerRoleSeedOrganisation,
  ProjectRoleCapabilities,
  ProjectRoleUser,
  ProjectSubmitBaselineRelations,
  ProjectSubmitDraft,
} from '$lib/db/zod/schema/project.types'

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = getAdminFacetTabsForResource(FirstClassResource.project)
const resolvedFacetTabs = $derived.by(() => {
  const tabs = isNewProjectRef
    ? getAdminFacetTabsForResource(FirstClassResource.project, {
        coreOnly: true,
      })
    : new Map(facetTabs)
  if (shouldHideCapabilitiesFacet) tabs.delete('capabilities')
  return tabs
})

const editorCtrl = getEditorCtrl({
  headerCtrl,
  icon: ProjectIcon,
  facetTabs,
})

// § Config - Derived

const projectRef = $derived(page.params.project as string)
const locales = $derived(getLocaleOrder(getLocaleKey()))
const propertyLocales = ['en', 'zh-hans', 'zh-hant'] as const
const currentLocaleKey = $derived(getLocaleKey())
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const parentOrganisationId = $derived(page.url.searchParams.get('parentId') ?? '')
const cachedProjectForRef = $derived(
  adminCtx.appCtx.getResourceByRefSync(FirstClassResource.project, projectRef) as
    | ProjectGetResponse['data']
    | undefined,
)
const cachedProjectState = $derived(
  cachedProjectForRef ? ({ data: cachedProjectForRef } as ProjectGetState) : null,
)

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()
let lastSyncedFacetHash = $state('')

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let fieldsLayoutMutationVersion = $state(0)
let isProjectFieldResetInProgress = $state(false)
let selectedUsersById = $state<Record<string, User>>({})
let selectedParentOrganisationById = $state<
  Record<string, ParentSectionOrganisationItem>
>({})
let availableMapStyles = $state<MapStyleSelectionItem[]>([])
let selectedMapStyleSnapshot = $state<MapStyleSelectionItem | null>(null)
let isMapStyleScopeLoading = $state(false)
let autoSeededOwnerOrganisationIds = $state<Set<string>>(new Set())
let ownerRoleSeedAttempt = $state(0)
let hasAutoEnteredEditForNew = $state(false)
let hierarchy = $state<ResourceContext | null>(null)
let fieldRemoveMode = $state(false)
let settledProjectRef = $state<string | null>(null)
let optimisticHeaderState = $state<HeaderTransitionSnapshot>({
  canEdit: true,
  canPublish: true,
  showDeleteAction: true,
  showPublishAction: true,
  isPublished: false,
  isDeleted: false,
  facets: [],
})
let lastSettledProjectResourceHubId = $state<string | null | undefined>(undefined)
let stableCapabilityFacetVisibilityKey = $state('')
let stableShouldHideCapabilitiesFacet = $state(false)
let stableProjectCapabilityDefinitions = $state<CapabilityDefinitions>(
  {} as CapabilityDefinitions,
)
let stableEnabledProjectCapabilityKeys = $state<CapabilityKey[]>([])
let stableProjectCapabilityLabelByKey = $state<Partial<Record<CapabilityKey, string>>>(
  {},
)
let stableCapabilityMatrixRows = $state<UserCapabilityMatrixRow[]>([])
let showDisabledFields = $state(false)
let useCustomLicenseLabels = $state(false)
let customLicenseLabels = $state({
  text: '',
  image: '',
  data: '',
})
let lastLicenseEditorSyncKey = $state('')

// § State - Data

type ProjectGetState = ProjectGetResponse | null
let project = $state.raw<ProjectGetState>(null)
let committedProject = $state.raw<ProjectGetState>(null)

const commitProjectState = (value: ProjectGetState): void => {
  committedProject = value
  project = value
}

const commitSettledProjectState = (value: ProjectGetState): void => {
  commitProjectState(value)
  settledProjectRef = value?.data?.code ?? null
}

function isProjectStateForRef(state: ProjectGetState, ref: string): boolean {
  if (!state?.data || ref === NEW_REF) return false
  return state.data.code === ref
}

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isCapabilitiesFacet = $derived(activeFacet === 'capabilities')
const isLayersFacet = $derived(activeFacet === 'layers')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isImagesFacet = $derived(activeFacet === 'images')

const projectFacetOrder = $derived.by(
  () =>
    getAdminFacetOrderForResource(
      FirstClassResource.project,
      resolvedFacetTabs,
    ) as ProjectFacet[],
)

const buildFacetNavAction = createFacetNavActionBuilder<ProjectFacet>({
  resourceType: FirstClassResource.project,
  getFacetOrder: () => projectFacetOrder,
  getActiveFacet: () => activeFacet as ProjectFacet,
  navigateToFacet: facet =>
    navigateOnAdmin(adminCtx, FirstClassResource.project, projectRef, facet),
})

$effect(() => {
  const currentHash = page.url.hash
  if (currentHash === lastSyncedFacetHash) return
  lastSyncedFacetHash = currentHash
  syncAdminFacetFromHash({
    hash: currentHash,
    activeFacet,
    facetOrder: projectFacetOrder,
    adminCtx,
    resourceType: FirstClassResource.project,
    resourceRef: projectRef,
  })
})

bindAdminFacetHistorySync({
  getFacetOrder: () => projectFacetOrder,
  getActiveFacet: () => adminCtx.activeFacet as ProjectFacet | false,
  adminCtx,
  resourceType: FirstClassResource.project,
  getResourceRef: () => projectRef,
})
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewProjectRef = $derived(projectRef === NEW_REF)
const activeProject = $derived.by(() =>
  isProjectStateForRef(project, projectRef) ? project : null,
)
const activeCommittedProject = $derived.by(() =>
  isProjectStateForRef(committedProject, projectRef) ? committedProject : null,
)
const activeProjectData = $derived(activeProject?.data ?? null)
const activeCommittedProjectData = $derived(activeCommittedProject?.data ?? null)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewProjectRef) return true
  return guardRefDesync(
    activeProject as unknown as OrganisationGetState,
    activeCommittedProject as unknown as OrganisationGetState,
    projectRef,
  )
})
const isCurrentRefSettled = $derived(
  isNewProjectRef || settledProjectRef === projectRef,
)
const optimisticProjectData = $derived.by(() =>
  isCurrentRefLoaded ? activeProjectData : cachedProjectForRef,
)
const optimisticProjectHierarchy = $derived.by(() => {
  const projectData = optimisticProjectData
  if (!projectData) return null
  return adminCtx.appCtx.getHierarchySync(projectData)
})
const effectiveProjectResourceHubId = $derived.by(() => {
  const liveHubId = hierarchy?.organisation?.hubId
  if (typeof liveHubId === 'string' || liveHubId === null) return liveHubId

  const optimisticHubId = optimisticProjectHierarchy?.organisation?.hubId
  if (typeof optimisticHubId === 'string' || optimisticHubId === null) {
    return optimisticHubId
  }

  return lastSettledProjectResourceHubId ?? null
})

// § Form

// ═══════════════════════
// 1. FORM CONFIG + SUBMIT SHAPING
// ═══════════════════════

// Named i18n sections rendered in the project form.
type ProjectI18nSectionKey = 'descriptor'
// Fields eligible for machine translation/reset per i18n section.
const translatableI18nFieldsBySection: Record<
  ProjectI18nSectionKey,
  ReadonlyArray<'name' | 'nameShort' | 'description'>
> = {
  descriptor: ['name', 'nameShort', 'description'],
}
// Main remote-form configuration for project create/update.
const configuredProjectForm = configureForm(() => ({
  form: projectForm as never,
  initialErrors: false,
  onsubmit: (({ data }: { data: ProjectSubmitDraft }) => {
    // Normalize submit envelope (`meta` + `data`) and enforce mode/id invariants.
    const submittedPayload = prepareSubmitPayloadMeta(data as ProjectSubmitDraft, {
      defaultMode: isNewProjectRef ? 'create' : 'update',
      resolveUpdateId: () =>
        activeProjectData?.id ?? activeCommittedProjectData?.id ?? '',
    })
    if (isNewProjectRef) {
      submittedPayload.meta.mode = 'create'
      delete submittedPayload.meta.id
      delete (submittedPayload.meta as { updatedAt?: unknown }).updatedAt
    }
    // Guard against sparse form-array payloads (e.g. `data.properties.0 = undefined`)
    // so preflight always receives a dense object array.
    submittedPayload.data.properties = toDenseProperties(
      submittedPayload.data.properties as ProjectFormInput['data']['properties'],
    )

    // Last committed server state used as baseline for changed-only relation submission.
    const baselineFormInput = toProjectFormInput(activeCommittedProjectData, {
      organisationId: parentOrganisationId,
    })

    // Current in-memory form snapshot (post-user edits).
    const currentFormSnapshot = formCtx.form.fields.value() as ProjectCurrentFormDraft
    // Normalize project capability availability and enforce organisation scope.
    const normalizedProjectCapabilities = normalizeProjectCapabilitiesForSubmit({
      submittedCapabilities: submittedPayload.data.capabilities,
      fallbackCapabilities: currentFormSnapshot.data?.capabilities,
      availableCapabilityKeys: availableProjectCapabilityKeys,
    })
    submittedPayload.data.capabilities = normalizedProjectCapabilities

    // Submit userRoles only when materially changed.
    applyChangedRelationField({
      data: submittedPayload.data,
      key: 'userRoles',
      submittedValue: submittedPayload.data.userRoles,
      currentValue: currentFormSnapshot.data?.userRoles,
      baselineValue:
        (baselineFormInput.data as ProjectSubmitBaselineRelations).userRoles ?? [],
      toEffective: ({ submittedValue, currentValue }) =>
        submittedValue ?? currentValue ?? [],
      toComparableEffective: value =>
        toComparableProjectUserRolesForSubmit(value, {
          availableCapabilityKeys: availableProjectCapabilityKeys,
          normalizedProjectCapabilities,
        }),
      toComparableBaseline: value =>
        toComparableProjectUserRolesForSubmit(value, {
          availableCapabilityKeys: availableProjectCapabilityKeys,
          normalizedProjectCapabilities,
        }),
      toSignature: toStableSignature,
    })

    // Submit properties only when materially changed and with canonical ranks.
    applyChangedRelationField({
      data: submittedPayload.data,
      key: 'properties',
      submittedValue: submittedPayload.data.properties,
      currentValue: currentFormSnapshot.data?.properties,
      baselineValue:
        (baselineFormInput.data as ProjectSubmitBaselineRelations).properties ?? [],
      toEffective: ({ currentValue }) => {
        const liveProperties = untrack(() => [...currentProjectProperties])
        // Always prefer the live form snapshot for properties so header-only cards
        // (for inherited scopes) still contribute full rank updates.
        const raw =
          liveProperties ??
          currentValue ??
          (baselineFormInput.data as ProjectSubmitBaselineRelations).properties ??
          []
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
      key: 'license',
      submittedValue: submittedPayload.data.license,
      currentValue: currentFormSnapshot.data?.license,
      baselineValue:
        (baselineFormInput.data as ProjectSubmitBaselineRelations).license ??
        normalizeSharedProjectLicense(undefined, organisationAttributionFallback),
      toEffective: ({ submittedValue, currentValue }) =>
        normalizeSharedProjectLicense(
          (submittedValue ?? currentValue) as ProjectLicense | null | undefined,
          organisationAttributionFallback,
        ),
      toComparableEffective: value => value,
      toComparableBaseline: value =>
        normalizeSharedProjectLicense(
          value as ProjectLicense | null | undefined,
          organisationAttributionFallback,
        ),
      toSignature: toStableSignature,
    })

    submittedPayload.meta.licenseTouched = Object.hasOwn(
      submittedPayload.data,
      'license',
    )

    applyChangedRelationField({
      data: submittedPayload.data,
      key: 'layers',
      submittedValue: submittedPayload.data.layers,
      currentValue: currentFormSnapshot.data?.layers,
      baselineValue:
        (baselineFormInput.data as ProjectSubmitBaselineRelations).layers ?? [],
      toEffective: ({ submittedValue, currentValue }) => {
        const raw = submittedValue ?? currentValue ?? []
        if (!Array.isArray(raw)) return []
        return normalizeProjectLayersForSubmit(raw as Array<Record<string, unknown>>)
      },
      toComparableEffective: value => value,
      toComparableBaseline: value =>
        normalizeProjectLayersForSubmit(value as Array<Record<string, unknown>>),
      toSignature: toStableSignature,
    })

    return submittedPayload as typeof data
  }) as never,
  ...createResourceFormConfig({
    formEl: contentsElement,
    key: projectRef,
    schema: ProjectPreflightFormData as never,
    data: toProjectFormInput(activeCommittedProjectData, {
      organisationId: parentOrganisationId,
    }),
    submitUpdates: async () =>
      getProjectSubmitUpdates({
        projectId: activeProjectData?.id,
        entityQuery: getProject({
          ref: projectRef,
          refKey: 'code',
          meta: { isAdminRequest: true, profile: 'admin' },
        }),
        listQuery: getProjects({
          conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
          prisms: adminCtx.appCtx.state.prisms,
          meta: { isAdminRequest: true, profile: 'card' },
        }),
        extraQueries: [
          getLayers({
            conditions: adminCtx.appCtx.isSuperAdmin()
              ? { isArchived: null, isPublished: null }
              : { isArchived: false, isPublished: null },
            prisms: adminCtx.appCtx.state.prisms,
            meta: { isAdminRequest: true, profile: 'card' },
          }),
          getFeatures({
            conditions: adminCtx.appCtx.isSuperAdmin()
              ? { isArchived: null, isPublished: null }
              : { isArchived: false, isPublished: null },
            prisms: adminCtx.appCtx.state.prisms,
            meta: { isAdminRequest: true, profile: 'card' },
          }),
        ],
      }) as never,
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.project,
    getEntity: () => activeProject,
    refreshResource: async ({ data, shouldRedirect }) => {
      // Reload committed entity after successful submit (or non-redirect save).
      const submittedCode = data.data?.code?.trim() ?? ''
      const refreshed = await refreshProject(shouldRedirect ? submittedCode : undefined)
      commitSettledProjectState(refreshed)
    },
  }),
}))

// Bound form controller for template/actions.
const formCtx = $derived(configuredProjectForm())
// Required-field resolver from preflight schema.
const isRequiredInPreflight = createSchemaRequiredInferer(ProjectPreflightFormData)
// Dirty flag exposed to header actions.
const isDirty = $derived(Boolean(formCtx.dirty))

// Narrowed form adapter for property-only mutators.
const projectPropertyFormAdapter = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{ id?: Id; properties?: Property[] }>,
)
const currentProjectProperties = $derived(
  getCurrentProjectProperties(projectPropertyFormAdapter),
)
const formProjectLayerValues = $derived(
  (formCtx.form.fields.value().data?.layers ?? []) as Array<{
    id: string
    rank?: number
    isDefaultVisible?: boolean
  }>,
)
const projectLayersInSection = $derived.by(() => {
  const baseLayers = (activeProjectData?.layers ?? []).filter(
    layer => !layer.isArchived,
  )
  const overridesById = new Map(
    formProjectLayerValues.map(layer => [layer.id, layer] as const),
  )

  return [...baseLayers]
    .map(layer => {
      const override = overridesById.get(layer.id)
      return {
        ...layer,
        rank: override?.rank ?? layer.rank ?? 0,
        isDefaultVisible: override?.isDefaultVisible ?? layer.isDefaultVisible,
      }
    })
    .sort((left, right) => {
      const rankDiff = (left.rank ?? 0) - (right.rank ?? 0)
      if (rankDiff !== 0) return rankDiff
      return left.id.localeCompare(right.id)
    })
})
const currentProjectShortName = $derived(
  activeProjectData
    ? getI18n(activeProjectData, 'nameShort', adminCtx.appCtx.getUserPreferences())
    : '',
)

// ═══════════════════════
// 2. PROPERTY FORM ACTIONS + MUTATORS
// ═══════════════════════

const fieldActions = {
  add: (event: Event): void => {
    stopEvent(event)
    if (!headerCtrl.state.isEditing && canSubmitProject) {
      headerCtrl.setEditing(true)
    }
    addProjectPropertyForType(
      projectPropertyFormAdapter,
      'classifier',
      activeProjectData?.id ?? '',
      classifierComponentTypes,
      specifierComponentTypes,
    )
    revalidateAfterProgrammaticChange()
  },
  remove: (event: Event, propertyId: Id): void => {
    stopEvent(event)
    const target = currentProjectProperties.find(property => property.id === propertyId)
    if (target && target.scope !== 'project') {
      updateProjectPropertyBase(
        projectPropertyFormAdapter,
        propertyId,
        'isEnabled',
        false,
      )
    } else {
      removeProjectProperty(projectPropertyFormAdapter, propertyId)
      if (projectFieldsInSection.length <= 1) fieldRemoveMode = false
    }
    revalidateAfterProgrammaticChange()
  },
  increaseRank: async (event: Event, propertyId: Id): Promise<void> => {
    stopEvent(event)
    await scrollWithMovedProperty(
      propertyId,
      () => {
        changeProjectPropertyRankUnified(projectPropertyFormAdapter, propertyId, 'up')
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
        changeProjectPropertyRankUnified(projectPropertyFormAdapter, propertyId, 'down')
      },
      async () => {
        await tick()
        await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
      },
    )
    revalidateAfterProgrammaticChange()
  },
}

function replaceProjectLayerFormValues(
  layers: Array<{ id: string; isDefaultVisible: boolean }>,
): void {
  updateFormData(projectEntityUpdaterForm, data => {
    data.layers = layers.map((layer, rank) => ({
      id: layer.id,
      rank,
      isDefaultVisible: layer.isDefaultVisible,
    }))
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleProjectLayerDefault(layerId: string, nextValue: boolean): void {
  const nextLayers = projectLayersInSection.map(layer => ({
    id: layer.id,
    isDefaultVisible:
      layer.id === layerId ? nextValue : Boolean(layer.isDefaultVisible),
  }))
  replaceProjectLayerFormValues(nextLayers)
}

function onMoveProjectLayer(sourceLayerId: string, targetLayerId: string): void {
  const nextLayers = projectLayersInSection.map(layer => ({
    id: layer.id,
    isDefaultVisible: Boolean(layer.isDefaultVisible),
  }))
  const sourceIndex = nextLayers.findIndex(layer => layer.id === sourceLayerId)
  const targetIndex = nextLayers.findIndex(layer => layer.id === targetLayerId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return

  const [movedLayer] = nextLayers.splice(sourceIndex, 1)
  if (!movedLayer) return
  nextLayers.splice(targetIndex, 0, movedLayer)
  replaceProjectLayerFormValues(nextLayers)
}

// Update base property fields (`key`, `component`, numeric bounds, translatability).
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
  updateProjectPropertyBase(projectPropertyFormAdapter, propertyId, key, value)
  revalidateAfterProgrammaticChange()
}

// Update property i18n fields for a locale.
const updatePropertyI18n = (
  propertyId: Id,
  locale: Locale,
  key: 'label' | 'placeholder' | 'labelGen' | 'placeholderGen',
  value: string | boolean,
): void => {
  updateProjectPropertyI18n(projectPropertyFormAdapter, propertyId, locale, key, value)
  revalidateAfterProgrammaticChange()
}

// Append a new value option to a classifier property.
const addPropertyValue = (propertyId: Id): void => {
  addProjectPropertyValue(projectPropertyFormAdapter, propertyId)
  revalidateAfterProgrammaticChange()
}

const sortPropertyValuesAlphabetically = (propertyId: Id, locale: Locale): void => {
  sortProjectPropertyValuesAlphabetically(
    projectPropertyFormAdapter,
    propertyId,
    locale,
  )
  revalidateAfterProgrammaticChange()
}

// Remove a value option from a classifier property.
const removePropertyValue = (propertyId: Id, valueId: Id): void => {
  removeProjectPropertyValue(projectPropertyFormAdapter, propertyId, valueId)
  revalidateAfterProgrammaticChange()
}

// Reorder property value options.
const movePropertyValue = (propertyId: Id, valueId: Id, targetIndex: number): void => {
  reorderProjectPropertyValue(
    projectPropertyFormAdapter,
    propertyId,
    valueId,
    targetIndex,
  )
  revalidateAfterProgrammaticChange()
}

// Update localised value text for a property value row.
const updatePropertyValueI18n = (
  propertyId: Id,
  valueId: Id,
  locale: Locale,
  key: 'value',
  value: string,
): void => {
  updateProjectPropertyValueI18n(
    projectPropertyFormAdapter,
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
    projectPropertyFormAdapter,
    propertyId,
    valueId,
    key,
    value,
  )
  revalidateAfterProgrammaticChange()
}

const isPropertyEnabled = (property: Property): boolean =>
  property.scope === 'project'
    ? true
    : typeof (property as Property & { isEnabled?: boolean }).isEnabled === 'boolean'
      ? Boolean((property as Property & { isEnabled?: boolean }).isEnabled)
      : Boolean(property.isDefaultEnabled)

const getInheritedTailSpecificity = (property: Property): number => {
  if (property.scope === 'organisation') return 0
  if (property.scope === 'hub' && property.hubId) return 1
  if (property.scope === 'hub') return 2
  return 3
}

const getPropertyDisplayName = (property: Property): string =>
  (property.i18n?.en?.label ?? property.key ?? '').toString().toLowerCase()

const projectFieldsInSection = $derived.by(() => {
  if (!isFieldsFacet) return []
  const rows = [...currentProjectProperties]

  const sorted = rows.sort((left, right) => {
    const leftDisabledInherited = left.scope !== 'project' && !isPropertyEnabled(left)
    const rightDisabledInherited =
      right.scope !== 'project' && !isPropertyEnabled(right)
    if (leftDisabledInherited !== rightDisabledInherited) {
      return leftDisabledInherited ? 1 : -1
    }

    if (leftDisabledInherited && rightDisabledInherited) {
      const specificityDiff =
        getInheritedTailSpecificity(left) - getInheritedTailSpecificity(right)
      if (specificityDiff !== 0) return specificityDiff
      return getPropertyDisplayName(left).localeCompare(getPropertyDisplayName(right))
    }

    return (left.rank ?? 0) - (right.rank ?? 0)
  })

  return sorted.map((property, rank) => ({
    ...property,
    rank,
  }))
})

const isPropertyVisible = (property: Property): boolean =>
  showDisabledFields || isPropertyEnabled(property)

const enabledProjectFieldWindowSize = $derived.by(() => {
  if (!isFieldsFacet) return 0
  const firstDisabledInheritedIndex = projectFieldsInSection.findIndex(
    property => property.scope !== 'project' && !isPropertyEnabled(property),
  )
  return firstDisabledInheritedIndex >= 0
    ? firstDisabledInheritedIndex
    : projectFieldsInSection.length
})

const isProjectFieldsLoading = $derived.by(() => {
  if (!isFieldsFacet) return false
  if (isNewProjectRef) return false
  if (projectFieldsInSection.length > 0) return false
  return !isCurrentRefSettled
})

// ═══════════════════════
// 3. PROPERTY ISSUE DERIVATION
// ═══════════════════════

// Optional gate for suppressing form-level issues during controlled transitions.
const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

// De-duplicated form-level issue messages for section header display.
const formLevelIssues = $derived.by((): string[] => {
  return toFormLevelIssueMessages(visibleAllIssues)
})

const parentOrganisationIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      return Array.isArray(path) && path[0] === 'data' && path[1] === 'organisationId'
    })
    .map(toIssueMessage)
    .filter((message): message is string => Boolean(message))
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
    .filter((message): message is string => Boolean(message))
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

$effect(() => {
  const properties = formCtx.form.fields.value().data?.properties as
    | ProjectFormInput['data']['properties']
    | undefined
  if (!Array.isArray(properties)) return
  const dense = toDenseProperties(properties)
  if (dense.length === properties.length) return

  updateFormData(projectEntityUpdaterForm, data => {
    data.properties = dense as ProjectFormInput['data']['properties']
    return data
  })
})

// Property-scoped issue rows parsed from the full issue list.
const propertyFormIssues = $derived.by(
  (): Array<{ message: string; path?: Array<string | number> }> =>
    getPropertyFormIssues(visibleAllIssues),
)

const fieldSectionIssues = $derived.by(() => {
  if (!isFieldsFacet) return []
  const messages = propertyFormIssues
    .map(issue => issue.message)
    .filter(Boolean)
    .map(message => String(message))
  return Array.from(new Set(messages))
})

const projectLayerSectionIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      return Array.isArray(path) && path[0] === 'data' && path[1] === 'layers'
    })
    .map(toIssueMessage)
    .filter((message): message is string => Boolean(message))
  return Array.from(new Set(messages))
})

const fieldSectionIssueItemIds = $derived.by(() => {
  if (!isFieldsFacet) return []
  const properties = currentProjectProperties
  const ids = propertyFormIssues
    .map(issue => {
      const path = issue.path
      if (!Array.isArray(path)) return null
      const index = path[2]
      if (typeof index !== 'number') return null
      const property = properties[index]
      return property?.id ?? null
    })
    .filter((id): id is Id => Boolean(id))
  return Array.from(new Set(ids))
})

function resolveProjectPropertyCardPresentation(property: Property): 'full' | 'header' {
  return property.scope === 'project' ? 'full' : 'header'
}

function resolveProjectPropertyTitleHref(property: Property): string | null {
  if (!canSubmitProject) return null

  if (property.scope === 'organisation' && property.organisationId) {
    const organisationCode =
      adminCtx.appCtx.cache.organisation.get(property.organisationId)?.code ??
      property.organisationId
    return `/admin/organisations/${organisationCode}#fields`
  }

  if (property.scope === 'hub') {
    const hubCodeFromProperty = (
      property as Property & { hub?: { code?: string | null } }
    ).hub?.code
    const hubCode = property.hubId
      ? (hubCodeFromProperty ??
        adminCtx.appCtx.cache.hub.get(property.hubId)?.code ??
        'core')
      : 'core'
    return `/admin/hubs/${hubCode}#fields`
  }

  return null
}

function resolveProjectPropertySourceTag(property: Property): {
  label: string
  tone: 'global' | 'hub' | 'org' | 'project'
  title?: string
  iconComponent?: typeof Blend
} {
  const typeTag =
    property.type === 'classifier'
      ? {
          title: m.admin__forms_common_categorical_field(),
          iconComponent: Blend,
        }
      : {
          title: m.admin__forms_common_free_form_field(),
          iconComponent: Type,
        }

  if (property.scope === 'project') {
    return { label: m.deft_mealy_ant_vent().toLowerCase(), tone: 'project', ...typeTag }
  }

  if (property.scope === 'organisation') {
    return { label: m.any_small_midge_aim().toLowerCase(), tone: 'org', ...typeTag }
  }

  if (property.scope === 'hub') {
    if (property.hubId) {
      const hubCode = adminCtx.appCtx.cache.hub.get(property.hubId)?.code ?? null
      if (hubCode && hubCode !== 'core')
        return {
          label: m.hub__title().replace(/s$/iu, '').toLowerCase(),
          tone: 'hub',
          ...typeTag,
        }
    }
    return { label: 'global', tone: 'global', ...typeTag }
  }

  return { label: m.deft_mealy_ant_vent().toLowerCase(), tone: 'project', ...typeTag }
}

// ═══════════════════════
// 4. USER ROLE FORM STATE + PROJECTIONS
// ═══════════════════════

// Current editable user-role rows from form state.
const formUserRoleValues = $derived(
  (formCtx.form.fields.value().data?.userRoles ?? []) as Array<{
    userId: string
    role: string
    capabilities?: ProjectRoleCapabilities
  }>,
)
// Narrowed adapter for user-role mutators.
const userRoleUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{
    userRoles?: Array<{
      userId: string
      role: string
      capabilities?: ProjectRoleCapabilities
    }>
  }>,
)
// Resolver for role-field names/hidden attrs in template wiring.
const userRoleFieldResolverForm = $derived(
  formCtx.form as unknown as UserRoleFieldNameResolverForm,
)
// Generic entity-data update adapter for project form payload.
const projectEntityUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<ProjectFormInput['data']>,
)
// Narrowed i18n-only adapter for translation/reset helpers.
const projectI18nUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<
    Pick<ProjectFormInput['data'], 'i18n'>
  >,
)
// Hidden-input attrs for stable userId submission across role rows.
const hiddenUserIdInputAttrs = $derived.by(() => {
  const rows = userRoleFieldResolverForm.fields.data?.userRoles ?? []
  return formUserRoleValues
    .map((userRole, index) => {
      const userId = typeof userRole.userId === 'string' ? userRole.userId : ''
      if (!userId) return null
      return rows[index]?.userId?.as('hidden', userId)
    })
    .filter(Boolean) as Array<Record<string, unknown>>
})
const hiddenProjectCapabilityInputAttrs = $derived.by(() => {
  const capabilityFields = formCtx.form.fields.data.capabilities
  return availableProjectCapabilityKeys
    .map(capabilityKey => {
      const field = capabilityFields?.[capabilityKey]
      if (!field || typeof field.as !== 'function') return null
      const value = formProjectCapabilities[capabilityKey] ? 'true' : 'false'
      return field.as('hidden', value)
    })
    .filter(Boolean) as Array<Record<string, unknown>>
})
const hiddenProjectLayerInputAttrs = $derived.by(() => {
  return formProjectLayerValues.flatMap((layer, index) => {
    const layerId = typeof layer.id === 'string' ? layer.id : ''
    if (!layerId) return []

    return [
      {
        type: 'hidden',
        name: `data.layers[${index}].id`,
        value: layerId,
      },
      {
        type: 'hidden',
        name: `data.layers[${index}].rank`,
        value: String(layer.rank ?? index),
      },
      {
        type: 'hidden',
        name: `data.layers[${index}].isDefaultVisible`,
        value: layer.isDefaultVisible ? 'true' : 'false',
      },
    ]
  })
})
const hiddenUserRoleCapabilityInputAttrs = $derived.by(() => {
  const rows = userRoleFieldResolverForm.fields.data?.userRoles ?? []
  return formUserRoleValues.flatMap(
    (userRole, index) =>
      availableProjectCapabilityKeys
        .map(capabilityKey => {
          const field = rows[index]?.capabilities?.[capabilityKey]
          if (!field || typeof field.as !== 'function') return null
          const value =
            normalizeProjectRoleCapabilities(userRole.capabilities)[capabilityKey] ===
            true
              ? 'true'
              : 'false'
          return field.as('hidden', value)
        })
        .filter(Boolean) as Array<Record<string, unknown>>,
  )
})

const organisationAttributionFallback = $derived.by(() => {
  const selectedOrganisation = selectedParentOrganisation
  const localeName =
    (
      selectedOrganisation?.i18n as
        | Record<string, { name?: string; nameShort?: string } | undefined>
        | undefined
    )?.[currentLocaleKey]?.nameShort ??
    (
      selectedOrganisation?.i18n as
        | Record<string, { name?: string; nameShort?: string } | undefined>
        | undefined
    )?.[currentLocaleKey]?.name ??
    selectedOrganisation?.i18n?.en?.nameShort ??
    selectedOrganisation?.i18n?.en?.name ??
    (
      hierarchy?.organisation?.i18n as
        | Record<string, { name?: string; nameShort?: string } | undefined>
        | undefined
    )?.[currentLocaleKey]?.nameShort ??
    (
      hierarchy?.organisation?.i18n as
        | Record<string, { name?: string; nameShort?: string } | undefined>
        | undefined
    )?.[currentLocaleKey]?.name ??
    hierarchy?.organisation?.i18n?.en?.nameShort ??
    hierarchy?.organisation?.i18n?.en?.name ??
    ''
  return typeof localeName === 'string' ? localeName : ''
})

const formProjectLicense = $derived.by(() =>
  normalizeSharedProjectLicense(
    formCtx.form.fields.value().data?.license as ProjectLicense | undefined,
    organisationAttributionFallback,
  ),
)

const baselineProjectLicense = $derived.by(() =>
  normalizeSharedProjectLicense(
    activeCommittedProjectData?.license as ProjectLicense | undefined,
    organisationAttributionFallback,
  ),
)

const hasLicenseChanges = $derived.by(
  () =>
    toStableSignature(formProjectLicense) !== toStableSignature(baselineProjectLicense),
)

const currentProjectLicenseIntent = $derived.by(() =>
  getProjectLicenseIntent(formProjectLicense),
)

const licenseWizardChoiceCards = [
  {
    key: 'publicDomain' as const,
    title: m.admin__project_license_choice_public_domain_title(),
    description: m.admin__project_license_choice_public_domain_description(),
  },
  {
    key: 'conditional' as const,
    title: m.admin__project_license_choice_conditional_title(),
    description: m.admin__project_license_choice_conditional_description(),
  },
  {
    key: 'allRightsReserved' as const,
    title: m.admin__project_license_choice_all_rights_reserved_title(),
    description: m.admin__project_license_choice_all_rights_reserved_description(),
  },
]

const licenseRightRows = [
  {
    key: 'BY' as const,
    label: 'BY',
    description: m.admin__project_license_condition_by_description(),
  },
  {
    key: 'SA' as const,
    label: 'SA',
    description: m.admin__project_license_condition_sa_row_description(),
  },
  {
    key: 'NC' as const,
    label: 'NC',
    description: m.admin__project_license_condition_nc_row_description(),
  },
] satisfies Array<{
  key: 'BY' | 'SA' | 'NC'
  label: string
  description: string
}>

function onApplyProjectLicense(params: {
  license: ProjectLicense
  useCustomLicenseLabels: boolean
  customLicenseLabels: typeof customLicenseLabels
}): void {
  useCustomLicenseLabels = params.useCustomLicenseLabels
  customLicenseLabels = params.customLicenseLabels

  updateFormData(projectEntityUpdaterForm, data => {
    data.license = {
      ...params.license,
      meta: {
        ...params.license.meta,
        history: formProjectLicense.meta.history ?? [],
      },
    }
    return data
  })
  revalidateAfterProgrammaticChange()
}

function syncLicenseEditorStateFromForm(): void {
  useCustomLicenseLabels = isCustomProjectLicense(formProjectLicense)
  customLicenseLabels = {
    text: formProjectLicense.media.text.license,
    image: formProjectLicense.media.image.license,
    data: formProjectLicense.media.data.license,
  }
}

function updateProjectLicense(
  params: Partial<{
    intent: ProjectLicenseIntent
    attribution: string
    allMediaSameRights: boolean
    rights: Partial<Record<ProjectLicenseMediaType, Partial<ProjectLicenseRights>>>
    useCustomLabels: boolean
    customLabels: typeof customLicenseLabels
  }> = {},
): void {
  const nextUseCustomLabels = params.useCustomLabels ?? useCustomLicenseLabels
  const nextCustomLabels = params.customLabels ?? customLicenseLabels
  const nextLicense = buildProjectLicense({
    attribution: params.attribution ?? formProjectLicense.meta.attribution,
    intent: params.intent ?? currentProjectLicenseIntent,
    allMediaSameRights:
      params.allMediaSameRights ?? formProjectLicense.meta.allMediaSameRights,
    rights: params.rights ?? {
      all: formProjectLicense.media.all,
      image: formProjectLicense.media.image,
      text: formProjectLicense.media.text,
      data: formProjectLicense.media.data,
    },
    useCustomLabels: nextUseCustomLabels,
    customLabels: nextCustomLabels,
  })

  updateFormData(projectEntityUpdaterForm, data => {
    data.license = nextLicense
    return data
  })
  revalidateAfterProgrammaticChange()
}

// Select field names keyed by userId for role dropdown binding.
const roleFieldNameByUserId = $derived.by(() => {
  const rows = userRoleFieldResolverForm.fields.data?.userRoles ?? []
  return Object.fromEntries(
    formUserRoleValues.map((userRole, index) => [
      userRole.userId,
      rows[index]?.role?.as('select')?.name ?? '',
    ]),
  ) as Record<string, string>
})

// Display-ready project role rows merged from persisted roles + current form edits.
const projectUserRoles = $derived.by(() => {
  const baseRoles = (activeProjectData?.userRoles ?? []) as ProjectRoleUser[]
  const baseProjectId = activeProjectData?.id ?? ''
  const roleByUserId = new Map(formUserRoleValues.map(role => [role.userId, role]))

  return formUserRoleValues.flatMap(formUserRole => {
    const baseRole = baseRoles.find(userRole => userRole.userId === formUserRole.userId)
    if (baseRole) {
      const formRole = roleByUserId.get(formUserRole.userId)
      return [
        {
          ...baseRole,
          role: formRole?.role ?? baseRole.role,
          capabilities: normalizeProjectRoleCapabilities(
            formRole?.capabilities ?? baseRole.capabilities,
          ),
        },
      ]
    }

    const selectedUser = selectedUsersById[formUserRole.userId]
    if (!selectedUser) return []

    return [
      {
        projectId: baseProjectId,
        userId: formUserRole.userId,
        role: formUserRole.role,
        capabilities: normalizeProjectRoleCapabilities(formUserRole.capabilities),
        user: {
          id: selectedUser.id,
          name: selectedUser.name,
          image: selectedUser.image,
          attribution: selectedUser.attribution,
        },
      } as ProjectRoleUser,
    ]
  })
})

// CAPABILITIES

const capabilityIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      if (!Array.isArray(path)) return false
      return (
        path[0] === 'data' && (path[1] === 'capabilities' || path[1] === 'userRoles')
      )
    })
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))
  return Array.from(new Set(messages))
})

const capabilitySourceOrganisationId = $derived.by(() =>
  resolveProjectCapabilitySourceOrganisationId({
    formOrganisationId: String(formCtx.form.fields.data.organisationId.value() ?? ''),
    optimisticOrganisationId: optimisticProjectData?.organisationId,
    committedOrganisationId: activeCommittedProjectData?.organisationId,
    hierarchyOrganisationId: hierarchy?.organisation?.id,
  }),
)

const projectCapabilityDefinitionState = $derived.by(() =>
  resolveProjectCapabilityDefinitionState({
    organisationId: capabilitySourceOrganisationId,
    isNewProjectRef,
    hierarchyOrganisation: hierarchy?.organisation,
    selectedOrganisation: selectedParentOrganisationById[
      capabilitySourceOrganisationId
    ] as
      | ({ capabilities?: CapabilityDefinitions } & ParentSectionOrganisationItem)
      | undefined,
  }),
)
const organisationCapabilityDefinitions = $derived(
  projectCapabilityDefinitionState.definitions,
)
const isProjectCapabilitySourceResolved = $derived(
  projectCapabilityDefinitionState.isResolved,
)

const availableProjectCapabilityKeys = $derived(
  getCapabilityKeysFromDefinitions(stableProjectCapabilityDefinitions),
)
const hasAnyProjectCapabilitiesConfigured = $derived(
  availableProjectCapabilityKeys.length > 0,
)
const shouldHideCapabilitiesFacet = $derived.by(() =>
  isProjectCapabilitySourceResolved
    ? !hasAnyProjectCapabilitiesConfigured
    : stableShouldHideCapabilitiesFacet,
)
const isHeaderTransitionSettled = $derived.by(
  () =>
    isCurrentRefSettled &&
    !formCtx.submitting &&
    !headerCtrl.state.formActions?.isPublishing &&
    !headerCtrl.state.formActions?.isDeleting,
)

const formProjectCapabilities = $derived(
  normalizeProjectCapabilities(formCtx.form.fields.value().data?.capabilities),
)

const enabledProjectCapabilityKeys = $derived.by(() =>
  availableProjectCapabilityKeys.filter(key => formProjectCapabilities[key] === true),
)

const projectCapabilityLabelByKey = $derived.by(
  () =>
    Object.fromEntries(
      availableProjectCapabilityKeys.map(key => {
        const label =
          stableProjectCapabilityDefinitions[key]?.i18n?.[currentLocaleKey] ||
          stableProjectCapabilityDefinitions[key]?.i18n?.en ||
          getCapabilityLabel(key, currentLocaleKey)
        return [key, label]
      }),
    ) as Partial<Record<CapabilityKey, string>>,
)

$effect(() => {
  const nextVisibilityKey = `${projectRef}:${capabilitySourceOrganisationId}`
  if (isProjectCapabilitySourceResolved) {
    stableShouldHideCapabilitiesFacet = !hasAnyProjectCapabilitiesConfigured
  }

  const hasLiveCapabilities =
    getCapabilityKeysFromDefinitions(organisationCapabilityDefinitions).length > 0
  const isSameCapabilitySource =
    stableCapabilityFacetVisibilityKey === nextVisibilityKey
  const shouldCommitLiveDefinitions =
    !isSameCapabilitySource ||
    hasLiveCapabilities ||
    (isHeaderTransitionSettled && isProjectCapabilitySourceResolved)

  if (!shouldCommitLiveDefinitions) return
  stableCapabilityFacetVisibilityKey = nextVisibilityKey
  stableProjectCapabilityDefinitions = organisationCapabilityDefinitions
})

$effect(() => {
  if (!isHeaderTransitionSettled) return
  if (!isProjectCapabilitySourceResolved) return
  if (activeFacet !== 'capabilities') return
  if (hasAnyProjectCapabilitiesConfigured) return
  adminCtx.setFacet('core', projectRef, FirstClassResource.project)
})

$effect(() => {
  const liveHubId = hierarchy?.organisation?.hubId
  if (!isHeaderTransitionSettled) return
  if (liveHubId === undefined) return
  lastSettledProjectResourceHubId = liveHubId
})

const capabilityMatrixRows = $derived.by(() =>
  !isCapabilitiesFacet
    ? []
    : projectUserRoles
        .filter(userRole => userRole.role !== ProjectRoleType.user)
        .map(userRole => ({
          userId: userRole.userId,
          name: userRole.user?.name ?? userRole.userId,
          role: String(userRole.role),
          capabilities: normalizeProjectRoleCapabilities(userRole.capabilities),
        })),
)

$effect(() => {
  const nextVisibilityKey = `${projectRef}:${capabilitySourceOrganisationId}`
  const hasLiveCapabilities =
    getCapabilityKeysFromDefinitions(organisationCapabilityDefinitions).length > 0
  const shouldCommitLiveRenderState =
    stableCapabilityFacetVisibilityKey !== nextVisibilityKey ||
    hasLiveCapabilities ||
    (isHeaderTransitionSettled && isProjectCapabilitySourceResolved)

  if (!shouldCommitLiveRenderState) return
  stableEnabledProjectCapabilityKeys = [...enabledProjectCapabilityKeys]
  stableProjectCapabilityLabelByKey = { ...projectCapabilityLabelByKey }
  stableCapabilityMatrixRows = [...capabilityMatrixRows]
})

$effect(() => {
  const organisationId = parentOrganisationIdValue
  if (!organisationId) return

  const selected = selectedParentOrganisationById[organisationId] as
    | { capabilities?: CapabilityDefinitions }
    | undefined
  const hasCapabilities =
    selected?.capabilities && typeof selected.capabilities === 'object'
  if (hasCapabilities) return

  let cancelled = false
  void getOrganisation({
    ref: organisationId,
    refKey: 'id',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).then(result => {
    if (cancelled) return
    if (!result?.data) return

    selectedParentOrganisationById = {
      ...selectedParentOrganisationById,
      [organisationId]: result.data as ParentSectionOrganisationItem,
    }
  })

  return () => {
    cancelled = true
  }
})

$effect(() => {
  const nextKey = `${projectRef}:${activeCommittedProjectData?.modifiedAt ?? 'new'}`
  if (nextKey === lastLicenseEditorSyncKey) return
  lastLicenseEditorSyncKey = nextKey
  syncLicenseEditorStateFromForm()
  console.log('Loaded project license', formProjectLicense)
})

// IMAGE

const activeProjectImage = $derived(
  (activeProjectData?.image ?? null) as ImageCtxEnvelope | null,
)
let isRefreshingMapRender = $state(false)
const imageProviderProps = $derived.by(() => {
  const projectData = activeProjectData
  const isValid = isCurrentRefLoaded && Boolean(projectData?.id)

  return {
    isAdminMode: true,
    isValid,
    image: isValid ? activeProjectImage : undefined,
    context:
      isValid && hierarchy
        ? {
            ctxType: ImageContextResource.project,
            ctxId: projectData?.id,
            organisation: hierarchy.organisation,
            project: projectData,
          }
        : undefined,
  }
})

// § Auth

const currentUser = $derived(adminCtx.appCtx.getUser())
const currentHub = $derived(adminCtx.appCtx.hub)
const authActor = $derived.by(() => toProjectAuthActor(currentUser))
const createContextHubId = $derived.by(() =>
  currentHub?.isCore ? null : (currentHub?.id ?? null),
)
const canCreateProject = $derived.by(() =>
  canCreateAnyProject(authActor, { resourceHubId: createContextHubId }),
)
const canEditProject = $derived.by(() => {
  const projectData = optimisticProjectData
  if (!projectData) return false
  return authorizeProjectUpdate(
    authActor,
    {
      resourceId: projectData.id,
      organisationId: projectData.organisationId,
      resourceHubId: effectiveProjectResourceHubId,
    },
    ['code'],
  ).allowed
})
const canSubmitProject = $derived(isNewProjectRef ? canCreateProject : canEditProject)
const canPublishProject = $derived.by(() => {
  const projectData = optimisticProjectData
  if (!projectData) return false
  return authorizeProjectPublish(authActor, {
    resourceId: projectData.id,
    organisationId: projectData.organisationId,
    resourceHubId: effectiveProjectResourceHubId,
  }).allowed
})
const canDeleteProject = $derived.by(() => {
  const projectData = optimisticProjectData
  if (!projectData) return false
  return authorizeProjectDelete(authActor, {
    resourceId: projectData.id,
    organisationId: projectData.organisationId,
    resourceHubId: effectiveProjectResourceHubId,
  }).allowed
})
const canEditImagePresentationMode = $derived(
  canSubmitProject && isCurrentRefLoaded && !optimisticProjectData?.isArchived,
)
const canEditImageDropzone = $derived(
  canEditProject && isCurrentRefLoaded && !optimisticProjectData?.isArchived,
)
const projectTitleMenuItems = $derived.by(() =>
  activeProjectData?.id
    ? [
        createMapRenderTitleMenuItem({
          isRefreshing: isRefreshingMapRender,
          onSelect: () => {
            void refreshProjectMapRender()
          },
        }),
      ]
    : [],
)
const canSetParentOrganisation = $derived.by(() => {
  const projectData = optimisticProjectData
  return canSetProjectParentOrganisation({
    actor: authActor,
    isCreateMode: isNewProjectRef,
    createContextHubId,
    source: projectData
      ? {
          resourceId: projectData.id,
          organisationId: projectData.organisationId,
          resourceHubId: effectiveProjectResourceHubId,
        }
      : null,
  })
})
const parentOrganisationIdValue = $derived(
  String(formCtx.form.fields.data.organisationId.value() ?? ''),
)
const hiddenParentOrganisationInputAttrs = $derived.by(() => {
  if (!parentOrganisationIdValue) return null
  return formCtx.form.fields.data.organisationId.as('hidden', parentOrganisationIdValue)
})
const selectedParentOrganisation = $derived.by(() => {
  if (!parentOrganisationIdValue) return null
  const selected = selectedParentOrganisationById[parentOrganisationIdValue]
  if (selected) return selected
  if (hierarchy?.organisation?.id === parentOrganisationIdValue)
    return hierarchy.organisation
  return null
})
const selectedMapStyleCodeValue = $derived(
  String(formCtx.form.fields.data.mapStyleCode.value() ?? ''),
)
const hiddenMapStyleInputAttrs = $derived.by(() =>
  selectedMapStyleCodeValue
    ? [formCtx.form.fields.data.mapStyleCode.as('hidden', selectedMapStyleCodeValue)]
    : [],
)
const selectedMapStyle = $derived.by(() => {
  if (!selectedMapStyleCodeValue) return null

  return (
    availableMapStyles.find(mapStyle => mapStyle.code === selectedMapStyleCodeValue) ??
    (selectedMapStyleSnapshot?.code === selectedMapStyleCodeValue
      ? selectedMapStyleSnapshot
      : null) ??
    ((optimisticProjectData?.mapStyle?.code === selectedMapStyleCodeValue
      ? optimisticProjectData.mapStyle
      : null) as MapStyleSelectionItem | null | undefined) ??
    null
  )
})

let lastMapStyleScopeSignature = $state('')

$effect(() => {
  const optimisticMapStyle = optimisticProjectData?.mapStyle as
    | MapStyleSelectionItem
    | null
    | undefined
  const resolvedMapStyle =
    availableMapStyles.find(mapStyle => mapStyle.code === selectedMapStyleCodeValue) ??
    ((optimisticMapStyle?.code === selectedMapStyleCodeValue
      ? optimisticMapStyle
      : null) as MapStyleSelectionItem | null | undefined) ??
    null

  if (!resolvedMapStyle) return

  const currentSnapshot = untrack(() => selectedMapStyleSnapshot)
  if (currentSnapshot === resolvedMapStyle) return
  selectedMapStyleSnapshot = resolvedMapStyle
})

$effect(() => {
  const organisationId = parentOrganisationIdValue
  const fallbackProject = !organisationId && !isNewProjectRef ? projectRef : ''
  const nextSignature = organisationId
    ? `organisation:${organisationId}`
    : fallbackProject
      ? `project:${fallbackProject}`
      : ''

  if (!nextSignature) {
    availableMapStyles = []
    isMapStyleScopeLoading = false
    lastMapStyleScopeSignature = ''
    return
  }

  if (lastMapStyleScopeSignature === nextSignature) {
    return
  }

  lastMapStyleScopeSignature = nextSignature
  isMapStyleScopeLoading = true

  untrack(() => {
    void (async () => {
      try {
        const response = organisationId
          ? await getProjectMapStyles({ organisationId })
          : await getProjectMapStyles({ projectId: fallbackProject })

        if (lastMapStyleScopeSignature !== nextSignature) {
          return
        }

        availableMapStyles = (response.data ?? []) as MapStyleSelectionItem[]
      } finally {
        if (lastMapStyleScopeSignature === nextSignature) {
          isMapStyleScopeLoading = false
        }
      }
    })()
  })
})

$effect(() => {
  if (!selectedMapStyleCodeValue) {
    return
  }

  if (isMapStyleScopeLoading) {
    return
  }

  if (
    availableMapStyles.some(mapStyle => mapStyle.code === selectedMapStyleCodeValue)
  ) {
    return
  }

  updateFormData(projectEntityUpdaterForm, data => {
    data.mapStyleCode = ''
    return data
  })
})

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
  sectionKey: string = 'descriptor',
): Promise<boolean> {
  const section = 'descriptor' as const
  const translated = await translateLocaleIntoEmptyFields({
    form: projectI18nUpdaterForm,
    sourceLocale,
    targetLocale,
    fields: [...translatableI18nFieldsBySection[section]],
  })
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

function onResetLocale(targetLocale: Locale, sectionKey: string = 'descriptor'): void {
  const section = 'descriptor' as const
  resetLocaleFields({
    form: projectI18nUpdaterForm,
    targetLocale,
    fields: [...translatableI18nFieldsBySection[section]],
  })
  revalidateAfterProgrammaticChange()
}

async function onTranslatePropertyLocale(
  propertyId: Id,
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const translated = await translateProjectPropertyLocale(
    projectPropertyFormAdapter,
    propertyId,
    sourceLocale,
    targetLocale,
  )
  if (translated) revalidateAfterProgrammaticChange()
  return translated
}

function onResetPropertyLocale(propertyId: Id, targetLocale: Locale): void {
  resetProjectPropertyLocale(projectPropertyFormAdapter, propertyId, targetLocale)
  revalidateAfterProgrammaticChange()
}

function onAddUser(user: User): void {
  selectedUsersById[user.id] = user
  project = addUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: project,
    user,
    defaultRole: ProjectRoleType.maintainer,
    foreignKey: 'projectId',
  })
  revalidateAfterProgrammaticChange()
}

function onRemoveUser(userId: string): void {
  const { [userId]: _removedUser, ...rest } = selectedUsersById
  selectedUsersById = rest
  project = removeUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: project,
    userId,
  })
  revalidateAfterProgrammaticChange()
}

function onRoleChange(userId: string, role: ProjectRoleType): void {
  project = updateUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: project,
    userId,
    role,
  })
  updateFormData(userRoleUpdaterForm, data => {
    data.userRoles = toUserRolesWithRoleChange({
      userRoles: data.userRoles,
      userId,
      role,
    }) as typeof data.userRoles
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleProjectCapability(capabilityKey: CapabilityKey, value: boolean): void {
  updateFormData(projectEntityUpdaterForm, data => {
    const next = toProjectCapabilitiesAndRolesForToggle({
      capabilities: data.capabilities,
      userRoles: data.userRoles,
      capabilityKey,
      value,
    })
    data.capabilities = next.capabilities
    data.userRoles = next.userRoles
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleUserCapability(params: {
  userId: string
  capabilityKey: CapabilityKey
  value: boolean
}): void {
  updateFormData(userRoleUpdaterForm, data => {
    data.userRoles = toUserRolesForCapabilityToggle({
      userRoles: data.userRoles,
      userId: params.userId,
      capabilityKey: params.capabilityKey,
      value: params.value,
    }) as typeof data.userRoles
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onReplaceParentOrganisation(
  organisation: ParentSectionOrganisationItem,
): void {
  selectedParentOrganisationById = {
    [organisation.id]: organisation,
  }
  updateFormData(projectEntityUpdaterForm, data => {
    data.organisationId = organisation.id
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onSelectMapStyle(mapStyle: MapStyleSelectionItem): void {
  updateFormData(projectEntityUpdaterForm, data => {
    data.mapStyleCode = mapStyle.code
    return data
  })
  revalidateAfterProgrammaticChange()
}

async function onSearchParentOrganisations(
  query: string,
): Promise<ParentSectionOrganisationItem[]> {
  if (!canSetParentOrganisation) return []

  const profileMeta = { isAdminRequest: true, profile: 'admin' as const }
  const baseParams = {
    q: query,
    prisms: adminCtx.appCtx.state.prisms,
    meta: profileMeta,
  }

  const scope = resolveProjectParentOrganisationScope({
    actor: authActor,
    isCreateMode: isNewProjectRef,
    createContextHubId,
    sourceHubId: hierarchy?.organisation?.hubId ?? null,
  })

  if (scope.allowAll) {
    const result = await getOrganisations({
      ...baseParams,
      conditions: { isArchived: false },
    })
    return result.data as ParentSectionOrganisationItem[]
  }

  const queries: Array<Promise<{ data: ParentSectionOrganisationItem[] }>> = []

  if (scope.organisationIds.length > 0) {
    queries.push(
      getOrganisations({
        ...baseParams,
        conditions: {
          id: scope.organisationIds,
          isArchived: false,
        },
      }) as Promise<{ data: ParentSectionOrganisationItem[] }>,
    )
  }

  if (scope.hubIds.length > 0) {
    queries.push(
      getOrganisations({
        ...baseParams,
        conditions: {
          hubId: scope.hubIds,
          isArchived: false,
        },
      }) as Promise<{ data: ParentSectionOrganisationItem[] }>,
    )
  }

  if (queries.length === 0) return []

  const results = await Promise.all(queries)
  const byId = new Map<string, ParentSectionOrganisationItem>()
  for (const result of results) {
    for (const organisation of result.data) {
      byId.set(organisation.id, organisation)
    }
  }

  return Array.from(byId.values())
}

async function refreshProject(ref: string = projectRef): Promise<ProjectGetState> {
  if (ref === NEW_REF) return null
  const result = (await getProject({
    ref,
    refKey: 'code',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).catch(() => null)) as ProjectGetState
  return result
}

async function handleProjectStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
}: {
  field: ProjectBooleanField
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: typeof publishProject | typeof archiveProject
}): Promise<void> {
  const projectData = project?.data
  if (!projectData) return

  const nextState = !projectData[field]
  setBusy(true)

  try {
    await mutate({
      id: projectData.id,
      state: nextState,
      meta: { isAdminRequest: true },
    }).updates(
      getProject({
        ref: projectRef,
        refKey: 'code',
        meta: { isAdminRequest: true, profile: 'admin' },
      }).withOverride(overrideProjectEntityBoolean(field, nextState)),
      getProjects({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
        meta: { isAdminRequest: true, profile: 'card' },
      }).withOverride(overrideProjectListItemBoolean(projectData.id, field, nextState)),
    )

    commitSettledProjectState(await refreshProject())
    toast.success(
      `${nextState ? successWhenTrue : successWhenFalse} ${getNameForToast(project, 'nameShort')}`,
    )
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    setBusy(false)
  }
}

async function onPublishToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canPublishProject) return
  await handleProjectStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishProject,
  })
}

async function onDeleteToggle(): Promise<void> {
  if (!isCurrentRefLoaded || !canDeleteProject) return
  await handleProjectStateToggle({
    field: 'isArchived',
    successWhenTrue: m.bad_swift_cheetah_surge(),
    successWhenFalse: m.forms__restored(),
    setBusy: value => headerCtrl.setDeleting(value),
    mutate: archiveProject,
  })
}

async function onReset(): Promise<void> {
  fieldRemoveMode = false
  isProjectFieldResetInProgress = true
  fieldsLayoutMutationVersion += 1
  suppressFormLevelIssues = true
  formCtx.clearSubmitAttemptState()
  if (activeCommittedProjectData && activeCommittedProject) {
    project = activeCommittedProject
    formCtx.form.fields.set(toProjectFormInput(activeCommittedProjectData))
    syncLicenseEditorStateFromForm()
  } else {
    autoSeededOwnerOrganisationIds = new Set()
    ownerRoleSeedAttempt += 1
    formCtx.reset()
    syncLicenseEditorStateFromForm()
  }

  await tick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  isProjectFieldResetInProgress = false
}

function normalizePropertyInputIndices(formEl: HTMLFormElement): void {
  const controls = Array.from(
    formEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '[name^="data.properties["]',
    ),
  )
  if (controls.length === 0) return

  const pattern = /^data\.properties\[(\d+)\](.*)$/u
  const submittedIndices = Array.from(new FormData(formEl).keys())
    .map(name => {
      const match = name.match(pattern)
      return match ? Number(match[1]) : null
    })
    .filter((index): index is number => typeof index === 'number')
  if (submittedIndices.length === 0) return

  const uniqueSortedIndices = Array.from(new Set(submittedIndices)).sort(
    (a, b) => a - b,
  )
  const remapByIndex = new Map<number, number>(
    uniqueSortedIndices.map((index, denseIndex) => [index, denseIndex]),
  )
  const isAlreadyDense = uniqueSortedIndices.every(
    (index, denseIndex) => index === denseIndex,
  )
  if (isAlreadyDense) return

  for (const control of controls) {
    const match = control.name.match(pattern)
    if (!match) continue
    const currentIndex = Number(match[1])
    const nextIndex = remapByIndex.get(currentIndex)
    if (typeof nextIndex !== 'number') continue
    const suffix = match[2] ?? ''
    control.name = `data.properties[${nextIndex}]${suffix}`
  }
}

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) return

  if (isNewProjectRef) {
    formCtx.requestSubmit({ meta: { mode: 'create' } })
    return
  }

  if (contentsElement) {
    normalizePropertyInputIndices(contentsElement)
  }

  if (contentsElement) {
    const formData = new FormData(contentsElement)
    const propertyEntries = Array.from(formData.entries()).filter(([key]) =>
      key.startsWith('data.properties['),
    )
    const indexRegex = /^data\.properties\[(\d+)\]/u
    const indices = new Set<number>()
    for (const [key] of propertyEntries) {
      const match = key.match(indexRegex)
      if (!match) continue
      indices.add(Number(match[1]))
    }
    const sortedIndices = Array.from(indices).sort((a, b) => a - b)
    const first = sortedIndices[0] ?? 0
    const last = sortedIndices[sortedIndices.length - 1] ?? -1
    const missingIndices: number[] = []
    for (let index = first; index <= last; index += 1) {
      if (!indices.has(index)) missingIndices.push(index)
    }
  }

  updateFormData(projectEntityUpdaterForm, data => {
    data.properties = toDenseProperties(
      data.properties,
    ) as ProjectFormInput['data']['properties']
    return data
  })
  const baseMeta = activeCommittedProjectData
    ? (toProjectFormInput(activeCommittedProjectData).meta ?? {})
    : (toProjectFormInput(null, { organisationId: parentOrganisationId }).meta ?? {})
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

function onPresentationModeCommitted(nextMode: 'cover' | 'contain'): void {
  if (!canEditImagePresentationMode) return
  setProjectImagePresentationMode(project, nextMode)
  setProjectImagePresentationMode(committedProject, nextMode)
}

async function refreshProjectMapRender(): Promise<void> {
  await refreshMapRender({
    kind: 'projects',
    id: activeProjectData?.id,
    isRefreshing: isRefreshingMapRender,
    setRefreshing: next => {
      isRefreshingMapRender = next
    },
  })
}

// § Effects

$effect(() => {
  const cachedCode = cachedProjectState?.data?.code
  if (!cachedCode) return
  if (activeProjectData?.code === cachedCode) return
  commitProjectState(cachedProjectState)
})

$effect(() => {
  projectRef
  optimisticHeaderState = captureHeaderTransitionSnapshot(headerCtrl)
})

$effect(() => {
  const resolvedFacetTabsSnapshot = untrack(() => resolvedFacetTabs)
  return editorCtrl.syncRouteAndLoad({
    ref: projectRef,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
      settledProjectRef = null
      isRefreshingMapRender = false
      fieldRemoveMode = false
      showDisabledFields = false
      selectedUsersById = {}
      selectedParentOrganisationById = {}
      autoSeededOwnerOrganisationIds = new Set()
      ownerRoleSeedAttempt = 0
      hasAutoEnteredEditForNew = false
      isProjectFieldResetInProgress = false
      project = null
      hierarchy = null
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet =
          currentFacet && resolvedFacetTabsSnapshot.has(currentFacet)
            ? currentFacet
            : 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.project)
      })
    },
    load: refreshProject,
    commit: commitSettledProjectState,
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
    (isNewProjectRef ? `${NEW_TITLE} ${m.deft_mealy_ant_vent()}` : undefined) ??
    optimisticProjectData?.i18n?.[getLocaleKey()]?.name ??
    optimisticProjectData?.code ??
    m.deft_mealy_ant_vent()
  const displayFacets = resolveOptimisticHeaderFacets(
    isHeaderTransitionSettled,
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
  const headerKey = `${projectRef}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  if (Array.isArray(displayFacets)) {
    headerCtrl.setHeaderForEntity(title, ProjectIcon, new Map())
    headerCtrl.setFacets(displayFacets)
    headerCtrl.setTitleMenuItems(projectTitleMenuItems)
    return
  }
  headerCtrl.setHeaderForEntity(title, ProjectIcon, displayFacets)
  headerCtrl.setTitleMenuItems(projectTitleMenuItems)
})

$effect(() => {
  headerCtrl.setTitleMenuItems(projectTitleMenuItems)
})

$effect(() => {
  if (!formCtx.wasSubmitAttempted) return
  if (visibleAllIssues.length === 0) return
  const targetFacet = facetIssueSummary.firstFacetWithIssues
  if (!targetFacet) return
  if (activeFacet === targetFacet) return
  adminCtx.setFacet(targetFacet, projectRef, FirstClassResource.project)
})

// Archived entities are read-only until restored.
$effect(() => {
  const currentProject = activeProjectData
  if (!currentProject?.id) {
    hierarchy = null
    return
  }

  let cancelled = false
  void adminCtx.appCtx.getHierarchy(currentProject).then(result => {
    if (cancelled) return
    hierarchy = result
  })

  return () => {
    cancelled = true
  }
})

// Archived entities are read-only until restored.
$effect(() => {
  if (!optimisticProjectData?.isArchived) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
})

// New routes are create-only; users without create access are sent back to index.
$effect(() => {
  if (!isNewProjectRef) return
  if (canCreateProject) return
  navigateOnAdmin(adminCtx, FirstClassResource.project)
})

// New entities start in edit mode.
$effect(() => {
  if (!isNewProjectRef) {
    hasAutoEnteredEditForNew = false
    return
  }
  if (!canSubmitProject) return
  if (hasAutoEnteredEditForNew) return
  if (headerCtrl.state.isEditing) return
  headerCtrl.setEditing(true)
  hasAutoEnteredEditForNew = true
})

// Keep unauthorized users out of edit mode if the header state gets toggled externally.
$effect(() => {
  if (!isCurrentRefLoaded && !isNewProjectRef) return
  if (canSubmitProject) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
})

$effect(() => {
  if (!isNewProjectRef) return
  if (parentOrganisationIdValue) return

  const scope = resolveProjectParentOrganisationScope({
    actor: authActor,
    isCreateMode: true,
    createContextHubId,
    sourceHubId: hierarchy?.organisation?.hubId ?? null,
  })
  const defaultOrganisationId = resolveDefaultProjectOrganisationIdForCreate({
    isNewProjectRef,
    currentOrganisationId: parentOrganisationIdValue,
    scope,
  })
  if (!defaultOrganisationId) return

  void getOrganisation({
    ref: defaultOrganisationId,
    refKey: 'id',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).then(result => {
    if (!result?.data) return
    if (parentOrganisationIdValue) return

    selectedParentOrganisationById = {
      [defaultOrganisationId]: result.data as ParentSectionOrganisationItem,
    }
    updateFormData(projectEntityUpdaterForm, data => {
      data.organisationId = defaultOrganisationId
      return data
    })
    revalidateAfterProgrammaticChange()
  })
})

$effect(() => {
  if (!isNewProjectRef) return
  const organisationId = parentOrganisationIdValue
  if (!organisationId) return
  if (formUserRoleValues.length > 0) return
  void resolveOwnerRoleSeedForNewProject({
    organisationId,
    isNewProjectRef,
    formUserRoleValues,
    autoSeededOwnerOrganisationIds,
    ownerRoleSeedAttempt,
    validateAttempt: attempt =>
      attempt === ownerRoleSeedAttempt + 1 &&
      formUserRoleValues.length === 0 &&
      parentOrganisationIdValue === organisationId,
    getOrganisationById: async targetOrganisationId =>
      (await getOrganisation({
        ref: targetOrganisationId,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      })) as ProjectOwnerRoleSeedOrganisation,
  }).then(seed => {
    ownerRoleSeedAttempt = seed.nextOwnerRoleSeedAttempt
    if (!seed.shouldMarkSeeded) return

    autoSeededOwnerOrganisationIds = new Set([
      ...Array.from(autoSeededOwnerOrganisationIds),
      organisationId,
    ])
    if (!seed.shouldApply) return

    selectedUsersById = {
      ...selectedUsersById,
      ...seed.selectedOwners,
    }
    updateFormData(projectEntityUpdaterForm, data => {
      data.userRoles = seed.ownerRoles
      return data
    })
    revalidateAfterProgrammaticChange()
  })
})

$effect(() => {
  editorCtrl.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    toggleDelete: onDeleteToggle,
  })
})

// Wire stable header action handlers once.
$effect(() => {
  const isImageFacetActive = isImagesFacet
  const status = resolveOptimisticHeaderStatus({
    isSettled: isHeaderTransitionSettled,
    isImageFacetActive,
    isNewRef: isNewProjectRef,
    dirty: isDirty,
    isSubmitting: formCtx.submitting,
    hasIssues: visibleAllIssues.length > 0,
    isPublished: Boolean(optimisticProjectData?.isPublished),
    isDeleted: Boolean(optimisticProjectData?.isArchived),
    canEdit: canSubmitProject,
    canPublish: canPublishProject,
    showDeleteAction: !isNewProjectRef && canDeleteProject,
    showPublishAction: !isNewProjectRef,
    snapshot: optimisticHeaderState,
  })
  const inertActionOverrides =
    isHeaderTransitionSettled && !isImageFacetActive
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
    isReady={Boolean(formCtx.form?.fields)}
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
        sectionKey="descriptor"
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
          {#if canSetParentOrganisation}
            <FormParentSection
              title="Parent Organisation"
              subtitle="This project belongs to"
              issues={parentOrganisationIssues}
              parent={selectedParentOrganisation}
              hiddenInputAttrs={hiddenParentOrganisationInputAttrs}
              {isEditing}
              isSubmitting={formCtx.submitting}
              isSubmitRequested={formCtx.isSubmitRequested}
              startInAddingMode={isNewProjectRef}
              onSearch={onSearchParentOrganisations}
              onReplaceParent={onReplaceParentOrganisation}
            />
          {/if}
        {/snippet}

        {#snippet center()}
          <FormMapStyleSection
            title="Map style"
            subtitle="Choose the basemap assigned to this project."
            {availableMapStyles}
            {selectedMapStyle}
            {hiddenMapStyleInputAttrs}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewProjectRef}
            {onSelectMapStyle}
          />
        {/snippet}

        {#snippet right()}
          <FormSpecifiersFields
            title={m.admin__project_identifiers_title()}
            form={formCtx.form}
            fields={['code']}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </GridSpacer>

      <GridSpacer cols={3} leftCols={2} rightCols={1}>
        {#snippet left()}
          <FormUserRolesSection
            title={m.admin__forms_project_members_title()}
            subtitle={m.admin__forms_project_members_subtitle()}
            transitionEntityKey={activeProjectData?.id ?? projectRef}
            removeSelfResourceLabel={m.resource__project_singular()}
            issues={userRoleSectionIssues}
            userRoles={projectUserRoles}
            {hiddenUserIdInputAttrs}
            {roleFieldNameByUserId}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewProjectRef}
            availableRoles={[
              { value: ProjectRoleType.owner, label: m.profile__role_type__owner() },
              { value: ProjectRoleType.maintainer, label: 'Maintainer' },
              { value: ProjectRoleType.member, label: m.profile__role_type__member() },
              { value: ProjectRoleType.translator, label: 'Translator' },
              { value: ProjectRoleType.user, label: 'User' },
            ]}
            {onAddUser}
            {onRemoveUser}
            {onRoleChange}
          />
        {/snippet}

        {#snippet right()}
          <FormProjectLicenseSection
            title={m.field_license()}
            subtitle={m.admin__project_license_section_subtitle()}
            attributionPlaceholder={organisationAttributionFallback || m.admin__project_license_attribution_placeholder()}
            license={formProjectLicense}
            choiceCards={licenseWizardChoiceCards}
            rightRows={licenseRightRows}
            leafMediaTypes={[...projectLicenseLeafMediaTypes]}
            {useCustomLicenseLabels}
            {customLicenseLabels}
            {isEditing}
            isSubmitting={formCtx.submitting}
            onApplyLicense={onApplyProjectLicense}
          />
        {/snippet}
      </GridSpacer>

      <div class="h-16 shrink-0" aria-hidden="true"></div>
    </Main.Facet>
    <Main.Facet
      isVisible={isCapabilitiesFacet && hasAnyProjectCapabilitiesConfigured}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('capabilities', 'previous')}
      nextAction={buildFacetNavAction('capabilities', 'next')}
      attrs={{ 'data-facet-id': 'capabilities' }}
    >
      <ProjectCapabilities
        class={!isCurrentRefSettled ? 'bits-project-capabilities--transitioning' : ''}
        {capabilityIssues}
        availableCapabilityKeys={availableProjectCapabilityKeys}
        enabledCapabilityKeys={stableEnabledProjectCapabilityKeys}
        capabilityLabelByKey={stableProjectCapabilityLabelByKey}
        matrixRows={stableCapabilityMatrixRows}
        {isEditing}
        onToggleCapability={onToggleProjectCapability}
        onToggleCell={onToggleUserCapability}
      />
    </Main.Facet>
    <Main.Facet
      isVisible={isLayersFacet}
      transition="fade"
      fillHeight={true}
      class="bits-theme flex gap-4 min-h-0 flex-col"
      previousAction={buildFacetNavAction('layers', 'previous')}
      nextAction={buildFacetNavAction('layers', 'next')}
      attrs={{ 'data-facet-id': 'layers' }}
    >
      <FormProjectLayersSection
        title="Layer Order"
        subtitle="Drag layers to control project order and choose which ones appear when the project is added to the map."
        items={projectLayersInSection.map(layer => ({
          id: layer.id,
          projectNameShort: currentProjectShortName,
          layerName: getI18n(layer, 'name', adminCtx.appCtx.getUserPreferences()),
          isDefaultVisible: Boolean(layer.isDefaultVisible),
        }))}
        issues={projectLayerSectionIssues}
        {isEditing}
        isSubmitting={formCtx.submitting}
        onToggleDefault={onToggleProjectLayerDefault}
        onMove={onMoveProjectLayer}
      />
    </Main.Facet>
    <Main.Facet
      isVisible={isFieldsFacet}
      transition="fade"
      class="bits-theme flex gap-4 min-h-0 flex-col"
      fillHeight={true}
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormFieldsSection
        items={projectFieldsInSection}
        isLoading={isProjectFieldsLoading}
        title={m.admin__forms_common_fields()}
        description={m.admin__forms_common_fields_subtitle()}
        issues={fieldSectionIssues}
        actions={fieldActions}
        issueItemIds={fieldSectionIssueItemIds}
        layoutMutationVersion={fieldsLayoutMutationVersion}
        forceFlipDisabled={isProjectFieldResetInProgress}
        canEdit={canSubmitProject && isCurrentRefLoaded}
        {isEditing}
        removeMode={fieldRemoveMode}
        isVisibilityOn={showDisabledFields}
        onVisibilityToggle={nextVisible => {
          fieldsLayoutMutationVersion += 1
          showDisabledFields = nextVisible
        }}
        isItemVisible={property => isPropertyVisible(property)}
        onRemoveModeChange={value => {
          fieldRemoveMode = value
        }}
        card={{
            removeMode: fieldRemoveMode,
            locales: [...propertyLocales] as Array<'en' | 'zh-hans' | 'zh-hant'>,
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
              currentProjectProperties.findIndex(candidate => candidate.id === propertyId),
            getPropertyFields: (_propertyId, propertyIndex) =>
              getProjectPropertyFieldsForIndex(formCtx.form, propertyIndex),
            resolveCardPresentation: resolveProjectPropertyCardPresentation,
            resolveTitleHref: resolveProjectPropertyTitleHref,
            getMoveWindowSize: () => enabledProjectFieldWindowSize,
            isMoveLocked: property =>
              property.scope !== 'project' && !isPropertyEnabled(property),
            resolveSourceTag: resolveProjectPropertySourceTag,
          }}
      />
      <div class="w-full min-h-20 flex-none"></div>
    </Main.Facet>

    <div class="hidden" aria-hidden="true">
      {#if hasLicenseChanges}
        <input
          type="hidden"
          name="data.license"
          value={JSON.stringify(formProjectLicense)}
        >
        <input type="hidden" name="meta.licenseTouched" value="true">
      {/if}
      {#each hiddenProjectLayerInputAttrs as inputAttrs, index (index)}
        <input {...inputAttrs}>
      {/each}
      {#each hiddenProjectCapabilityInputAttrs as inputAttrs, index (index)}
        <input {...inputAttrs}>
      {/each}
      {#each hiddenUserRoleCapabilityInputAttrs as inputAttrs, index (index)}
        <input {...inputAttrs}>
      {/each}
    </div>
  </Main.Form>
  <Main.Facet
    isVisible={isImagesFacet}
    transition="fade"
    fillHeight={true}
    navMode="footer"
    previousAction={buildFacetNavAction('images', 'previous')}
    nextAction={buildFacetNavAction('images', 'next')}
    attrs={{ 'data-facet-id': 'images' }}
  >
    <EntityImage
      {page}
      entityId={activeProjectData?.id}
      {imageProviderProps}
      currentImage={activeProjectImage}
      ctx={activeProjectData?.id
        ? {
            ctxType: ImageContextResource.project,
            ctxId: activeProjectData.id,
          }
        : undefined}
      canEditPresentationMode={canEditImagePresentationMode}
      canEditDropzone={canEditImageDropzone}
      {onPresentationModeCommitted}
    />
  </Main.Facet>
</Main.Root>
