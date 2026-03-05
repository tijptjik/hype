<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { tick, untrack } from 'svelte'
// ENUMS
import { classifierComponentTypes, specifierComponentTypes } from '$lib/types'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleKey, getLocaleOrder, toLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  applyChangedRelationField,
  createResourceEditorPage,
  createResourceFormConfig,
  getNameForToast,
  guardRefDesync,
  isFormLevelIssue,
  prepareSubmitPayloadMeta,
  revalidateAfterSubmitAttempt,
  removeUserRoleSelection,
  resetLocaleFields,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
} from '$lib/client/services/form'
import {
  getCapabilityKeysFromDefinitions,
  getCapabilityLabel,
  normalizeProjectCapabilities,
  normalizeProjectRoleCapabilities,
} from '$lib/capabilities'
import {
  getProjectSubmitUpdates,
  normalizeProjectCapabilitiesForSubmit,
  normalizePropertiesForSubmit,
  overrideProjectEntityBoolean,
  overrideProjectListItemBoolean,
  resolveDefaultProjectOrganisationIdForCreate,
  seedOwnerRolesForNewProject as resolveOwnerRoleSeedForNewProject,
  toComparableProjectUserRolesForSubmit,
  toProjectCapabilitiesAndRolesForToggle,
  toStableSignature,
  toUserRolesForCapabilityToggle,
  toUserRolesWithRoleChange,
  toProjectFormInput,
} from '$lib/client/services/project'
import {
  addProjectPropertyForType,
  changeProjectPropertyRank,
  getCurrentProjectProperties,
  getPropertyFormIssues,
  getPropertyIssueItemIdsForTypeFromFormIssues,
  getPropertyIssuesForTypeFromFormIssues,
  getProjectPropertyFieldsForIndex,
  getPropertiesByType,
  removeProjectPropertyForType,
  resetProjectPropertyLocale,
  scrollWithMovedProperty,
  stopEvent,
  translateProjectPropertyLocale,
  updateProjectPropertyBase,
  updateProjectPropertyI18n,
  updateProjectPropertyValueI18n,
  addProjectPropertyValue,
  removeProjectPropertyValue,
  reorderProjectPropertyValue,
} from '$lib/client/services/property'
// CONTEXT
import { getAdminCtx } from '$lib/context/admin.svelte'
import { getHeaderCtrl } from '$lib/context/header.svelte'
// REMOTE
import {
  archiveProject,
  getProject,
  getProjects,
  projectForm,
  publishProject,
} from '$lib/api/server/project.remote'
import { getOrganisation, getOrganisations } from '$lib/api/server/organisation.remote'
// SCHEMA
import { ProjectPreflightFormData } from '$lib/db/zod'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  EntityImage,
  FormCreditFields,
  FormI18nDescriptorFields,
  FormI18nSection,
  FormParentOrganisationSection,
  FormSpecifiersFields,
  FormFieldsSection,
  ProjectCapabilities,
  FormUserRolesSection,
  GridSpacer,
  Main,
} from '$lib/bits'
import type { ParentSectionOrganisationItem } from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// NAVIGATION
import { getAdminFacetTabsForResource, navigateOnAdmin } from '$lib/navigation'
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
import ProjectIcon from 'virtual:icons/lucide/layout-grid'
// ENUMS
import { FirstClassResource, ImageContextResource, ProjectRoleType } from '$lib/enums'
// TYPES
import type {
  CapabilityDefinitions,
  CapabilityKey,
  FormDataUpdaterForm,
  ImageCtxEnvelope,
  Locale,
  OrganisationGetState,
  ProjectBooleanField,
  ProjectCurrentFormDraft,
  ProjectRoleCapabilities,
  PropertyDiscriminator,
  ProjectSubmitBaselineRelations,
  ProjectSubmitDraft,
  ProjectOwnerRoleSeedOrganisation,
  ProjectGetResponse,
  ProjectFormInput,
  Property,
  ProjectRoleUser,
  ResourceContext,
  UserRoleFieldNameResolverForm,
  User,
  Id,
} from '$lib/types'

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
  if (!hasAnyProjectCapabilitiesConfigured) tabs.delete('capabilities')
  return tabs
})

const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: ProjectIcon,
  facetTabs,
})

// § Config - Derived

const projectRef = $derived(page.params.project as string)
const locales = $derived(getLocaleOrder(getLocale()))
const currentFormLocale = $derived(toLocaleKey(getLocale()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const parentOrganisationId = $derived(page.url.searchParams.get('parentId') ?? '')

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let selectedUsersById = $state<Record<string, User>>({})
let selectedParentOrganisationById = $state<
  Record<string, ParentSectionOrganisationItem>
>({})
let autoSeededOwnerOrganisationIds = $state<Set<string>>(new Set())
let ownerRoleSeedAttempt = $state(0)
let hasAutoEnteredEditForNew = $state(false)
let hierarchy = $state<ResourceContext | null>(null)

// § State - Data

type ProjectGetState = ProjectGetResponse | null
let project = $state<ProjectGetState>(null)
let committedProject = $state<ProjectGetState>(null)

const commitProjectState = (value: ProjectGetState): void => {
  committedProject = value
  project = value
}

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isCapabilitiesFacet = $derived(activeFacet === 'capabilities')
const isFieldsFacet = $derived(activeFacet === 'fields')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewProjectRef = $derived(projectRef === NEW_REF)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewProjectRef) return true
  return guardRefDesync(
    project as unknown as OrganisationGetState,
    committedProject as unknown as OrganisationGetState,
    projectRef,
  )
})

// § Form

// ═══════════════════════
// 1. FORM CONFIG + SUBMIT SHAPING
// ═══════════════════════

// Named i18n sections rendered in the project form.
type ProjectI18nSectionKey = 'descriptor' | 'credit'
// Fields eligible for machine translation/reset per i18n section.
const translatableI18nFieldsBySection: Record<
  ProjectI18nSectionKey,
  ReadonlyArray<'name' | 'nameShort' | 'description' | 'license' | 'attribution'>
> = {
  descriptor: ['name', 'nameShort', 'description'],
  credit: ['license', 'attribution'],
}
// Per-section "remove mode" state used by classifier/specifier cards.
let sectionRemoveModes = $state<Record<PropertyDiscriminator, boolean>>({
  classifier: false,
  specifier: false,
})

// Main remote-form configuration for project create/update.
const configuredProjectForm = configureForm(() => ({
  form: projectForm as never,
  onsubmit: (({ data }: { data: ProjectSubmitDraft }) => {
    // Normalize submit envelope (`meta` + `data`) and enforce mode/id invariants.
    const submittedPayload = prepareSubmitPayloadMeta(data as ProjectSubmitDraft, {
      defaultMode: isNewProjectRef ? 'create' : 'update',
      resolveUpdateId: () => project?.data?.id ?? committedProject?.data?.id ?? '',
    })

    // Last committed server state used as baseline for changed-only relation submission.
    const baselineFormInput = toProjectFormInput(committedProject?.data, {
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
      toEffective: ({ submittedValue, currentValue }) => {
        const raw =
          submittedValue ??
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

    return submittedPayload as typeof data
  }) as never,
  ...createResourceFormConfig({
    formEl: contentsElement,
    key: projectRef,
    schema: ProjectPreflightFormData as never,
    data: toProjectFormInput(committedProject?.data, {
      organisationId: parentOrganisationId,
    }),
    submitUpdates: async () =>
      getProjectSubmitUpdates({
        projectId: project?.data?.id,
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
      }),
    adminCtx,
    headerCtrl,
    resourceType: FirstClassResource.project,
    getEntity: () => project,
    refreshResource: async ({ data, shouldRedirect }) => {
      // Reload committed entity after successful submit (or non-redirect save).
      const submittedCode = data.data?.code?.trim() ?? ''
      const refreshed = await refreshProject(shouldRedirect ? submittedCode : undefined)
      commitProjectState(refreshed)
      if (refreshed?.data) {
        formCtx.form.fields.set(toProjectFormInput(refreshed.data))
      }
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

// ═══════════════════════
// 2. PROPERTY FORM ACTIONS + MUTATORS
// ═══════════════════════

// Factory for section-scoped property actions (classifier/specifier).
function createPropertyActions(
  type: PropertyDiscriminator,
  getCount: () => number,
  clearRemoveMode: () => void,
) {
  return {
    add: (event: Event): void => {
      stopEvent(event)
      if (!headerCtrl.state.isEditing && canSubmitProject) {
        headerCtrl.setEditing(true)
      }
      addProjectPropertyForType(
        projectPropertyFormAdapter,
        type,
        project?.data?.id ?? '',
        classifierComponentTypes,
        specifierComponentTypes,
      )
      revalidateAfterProgrammaticChange()
    },
    remove: (event: Event, propertyId: Id): void => {
      stopEvent(event)
      removeProjectPropertyForType(projectPropertyFormAdapter, type, propertyId)
      if (getCount() <= 1) clearRemoveMode()
      revalidateAfterProgrammaticChange()
    },
    increaseRank: async (event: Event, propertyId: Id): Promise<void> => {
      stopEvent(event)
      await scrollWithMovedProperty(
        propertyId,
        () => {
          changeProjectPropertyRank(projectPropertyFormAdapter, type, propertyId, 'up')
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
          changeProjectPropertyRank(
            projectPropertyFormAdapter,
            type,
            propertyId,
            'down',
          )
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

// Action set for classifier properties.
const classifierActions = createPropertyActions(
  'classifier',
  () => classifierPropsInSection.length,
  () => {
    sectionRemoveModes.classifier = false
  },
)

// Action set for specifier properties.
const specifierActions = createPropertyActions(
  'specifier',
  () => specifierPropsInSection.length,
  () => {
    sectionRemoveModes.specifier = false
  },
)

// Update base property fields (`key`, `component`, numeric bounds, translatability).
const updatePropertyBase = (
  propertyId: Id,
  key: 'key' | 'component' | 'min' | 'max' | 'isTranslatable',
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

// Sorted classifier properties shown in the classifier section.
const classifierPropsInSection = $derived(
  getPropertiesByType(
    getCurrentProjectProperties(projectPropertyFormAdapter),
    'classifier',
  ),
)

// Sorted specifier properties shown in the specifier section.
const specifierPropsInSection = $derived(
  getPropertiesByType(
    getCurrentProjectProperties(projectPropertyFormAdapter),
    'specifier',
  ),
)

// ═══════════════════════
// 3. PROPERTY ISSUE DERIVATION
// ═══════════════════════

// Optional gate for suppressing form-level issues during controlled transitions.
const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

// De-duplicated form-level issue messages for section header display.
const formLevelIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(isFormLevelIssue)
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))
  return Array.from(new Set(messages))
})

// Property-scoped issue rows parsed from the full issue list.
const propertyFormIssues = $derived.by(
  (): Array<{ message: string; path?: Array<string | number> }> =>
    getPropertyFormIssues(visibleAllIssues),
)

// Resolved issue messages for one property discriminator section.
function getPropertyIssuesForType(type: PropertyDiscriminator): string[] {
  return getPropertyIssuesForTypeFromFormIssues({
    issues: propertyFormIssues,
    properties: getCurrentProjectProperties(projectPropertyFormAdapter),
    type,
  })
}

// Resolved property IDs that currently have issues in one section.
function getPropertyIssueItemIdsForType(type: PropertyDiscriminator): Id[] {
  return getPropertyIssueItemIdsForTypeFromFormIssues({
    issues: propertyFormIssues,
    properties: getCurrentProjectProperties(projectPropertyFormAdapter),
    type,
  })
}

// Classifier issue chips shown in section header.
const classifierPropertyIssues = $derived.by(() =>
  getPropertyIssuesForType('classifier'),
)

// Specifier issue chips shown in section header.
const specifierPropertyIssues = $derived.by(() => getPropertyIssuesForType('specifier'))

// Classifier property IDs with issue highlighting.
const classifierIssueItemIds = $derived.by(() =>
  getPropertyIssueItemIdsForType('classifier'),
)

// Specifier property IDs with issue highlighting.
const specifierIssueItemIds = $derived.by(() =>
  getPropertyIssueItemIdsForType('specifier'),
)

// Unified config model for rendering classifier/specifier field sections.
const fieldSections = $derived.by(
  (): Array<{
    type: PropertyDiscriminator
    title: string
    description: string
    items: Property[]
    issues: string[]
    actions: typeof classifierActions
    issueItemIds: Id[]
    removeMode: boolean
  }> => [
    {
      type: 'classifier',
      title: m.admin__forms_common_classifiers(),
      description: m.admin__forms_common_classifiers_subtitle(),
      items: classifierPropsInSection,
      issues: classifierPropertyIssues,
      actions: classifierActions,
      issueItemIds: classifierIssueItemIds,
      removeMode: sectionRemoveModes.classifier,
    },
    {
      type: 'specifier',
      title: m.admin__forms_common_specifiers(),
      description: m.admin__forms_common_specifiers_subtitle(),
      items: specifierPropsInSection,
      issues: specifierPropertyIssues,
      actions: specifierActions,
      issueItemIds: specifierIssueItemIds,
      removeMode: sectionRemoveModes.specifier,
    },
  ],
)

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
  const baseRoles = (project?.data?.userRoles ?? []) as ProjectRoleUser[]
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
        projectId: project?.data?.id ?? '',
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

const organisationCapabilityDefinitions = $derived.by(() => {
  const fromHierarchy = (
    hierarchy?.organisation as { capabilities?: CapabilityDefinitions } | undefined
  )?.capabilities
  if (fromHierarchy && typeof fromHierarchy === 'object') return fromHierarchy

  const selected = selectedParentOrganisationById[parentOrganisationIdValue] as
    | { capabilities?: CapabilityDefinitions }
    | undefined
  const fromSelected = selected?.capabilities
  if (fromSelected && typeof fromSelected === 'object') return fromSelected

  return {} as CapabilityDefinitions
})

const availableProjectCapabilityKeys = $derived(
  getCapabilityKeysFromDefinitions(organisationCapabilityDefinitions),
)
const hasAnyProjectCapabilitiesConfigured = $derived(
  availableProjectCapabilityKeys.length > 0,
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
          organisationCapabilityDefinitions[key]?.i18n?.[currentFormLocale] ||
          organisationCapabilityDefinitions[key]?.i18n?.en ||
          getCapabilityLabel(key, currentFormLocale)
        return [key, label]
      }),
    ) as Partial<Record<CapabilityKey, string>>,
)

const capabilityMatrixRows = $derived.by(() =>
  projectUserRoles
    .filter(userRole => userRole.role !== ProjectRoleType.user)
    .map(userRole => ({
      userId: userRole.userId,
      name: userRole.user?.name ?? userRole.userId,
      role: String(userRole.role),
      capabilities: normalizeProjectRoleCapabilities(userRole.capabilities),
    })),
)

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

// IMAGE

const activeProjectImage = $derived(
  (project?.data?.image ?? null) as ImageCtxEnvelope | null,
)
const imageProviderProps = $derived.by(() => {
  const projectData = project?.data
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
  const projectData = project?.data
  if (!projectData) return false
  return authorizeProjectUpdate(
    authActor,
    {
      resourceId: projectData.id,
      organisationId: projectData.organisationId,
      resourceHubId: hierarchy?.organisation?.hubId ?? null,
    },
    ['code'],
  ).allowed
})
const canSubmitProject = $derived(isNewProjectRef ? canCreateProject : canEditProject)
const canPublishProject = $derived.by(() => {
  const projectData = project?.data
  if (!projectData) return false
  return authorizeProjectPublish(authActor, {
    resourceId: projectData.id,
    organisationId: projectData.organisationId,
    resourceHubId: hierarchy?.organisation?.hubId ?? null,
  }).allowed
})
const canDeleteProject = $derived.by(() => {
  const projectData = project?.data
  if (!projectData) return false
  return authorizeProjectDelete(authActor, {
    resourceId: projectData.id,
    organisationId: projectData.organisationId,
    resourceHubId: hierarchy?.organisation?.hubId ?? null,
  }).allowed
})
const canEditImagePresentationMode = $derived(canSubmitProject && isCurrentRefLoaded)
const canEditImageDropzone = $derived(canEditProject && isCurrentRefLoaded)
const canSetParentOrganisation = $derived.by(() => {
  const projectData = project?.data
  return canSetProjectParentOrganisation({
    actor: authActor,
    isCreateMode: isNewProjectRef,
    createContextHubId,
    source: projectData
      ? {
          resourceId: projectData.id,
          organisationId: projectData.organisationId,
          resourceHubId: hierarchy?.organisation?.hubId ?? null,
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
  const section =
    sectionKey === 'credit' ? ('credit' as const) : ('descriptor' as const)
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
  const section =
    sectionKey === 'credit' ? ('credit' as const) : ('descriptor' as const)
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
    })
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
    })
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
  return (await getProject({
    ref,
    refKey: 'code',
    meta: { isAdminRequest: true, profile: 'admin' },
  }).catch(() => null)) as ProjectGetState
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

    commitProjectState(await refreshProject())
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

function onReset(): void {
  suppressFormLevelIssues = true
  formCtx.clearSubmitAttemptState()
  if (committedProject?.data) {
    project = committedProject
    formCtx.form.fields.set(toProjectFormInput(committedProject.data))
    return
  }
  autoSeededOwnerOrganisationIds = new Set()
  ownerRoleSeedAttempt += 1
  formCtx.reset()
}

function onSubmit(): void {
  suppressFormLevelIssues = false
  if (!isCurrentRefLoaded) return
  const baseMeta = committedProject?.data
    ? (toProjectFormInput(committedProject.data).meta ?? {})
    : (toProjectFormInput(null, { organisationId: parentOrganisationId }).meta ?? {})
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

function onPresentationModeCommitted(nextMode: 'cover' | 'contain'): void {
  if (!canEditImagePresentationMode) return
  if (project?.data?.image) {
    project.data.image.image.presentationMode = nextMode
  }
  if (committedProject?.data?.image) {
    committedProject.data.image.image.presentationMode = nextMode
  }
}

// § Effects

$effect(() => {
  const ref = projectRef
  return resourceEditorPage.syncRouteAndLoad({
    ref,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const currentFacet = adminCtx.activeFacet
        const nextFacet =
          currentFacet && resolvedFacetTabs.has(currentFacet) ? currentFacet : 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.project)
      })
    },
    load: refreshProject,
    commit: commitProjectState,
  })
})

// Keep entity header metadata (title/icon/facets) aligned with loaded organisation data.
$effect(() => {
  const ref = projectRef
  const title =
    (isNewProjectRef ? `${NEW_TITLE} ${m.deft_mealy_ant_vent()}` : undefined) ??
    project?.data?.i18n?.[getLocaleKey()]?.name ??
    project?.data?.code ??
    m.deft_mealy_ant_vent()
  const facetKey = Array.from(resolvedFacetTabs.keys()).join('|')
  const headerKey = `${ref}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  headerCtrl.setHeaderForEntity(title, ProjectIcon, new Map(resolvedFacetTabs))
})

// Archived entities are read-only until restored.
$effect(() => {
  const currentProject = project?.data
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
  if (!project?.data?.isArchived) return
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
  resourceEditorPage.wireHeaderHandlers({
    reset: onReset,
    submit: onSubmit,
    togglePublish: onPublishToggle,
    toggleDelete: onDeleteToggle,
  })
})

// Wire stable header action handlers once.
$effect(() => {
  const isImageFacetActive = isImagesFacet
  const dirty = isDirty
  const isSubmitting = formCtx.submitting
  const hasIssues = visibleAllIssues.length > 0
  const isPublished = Boolean(project?.data?.isPublished)
  const isDeleted = Boolean(project?.data?.isArchived)

  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
    headerCtrl,
    status: {
      dirty: isImageFacetActive ? false : dirty,
      isSubmitting: isImageFacetActive ? false : isSubmitting,
      hasIssues: isImageFacetActive ? false : hasIssues,
      isPublished,
      isDeleted,
      canEdit: isImageFacetActive ? false : canSubmitProject && isCurrentRefLoaded,
      canPublish: !isNewProjectRef && canPublishProject && isCurrentRefLoaded,
      showDeleteAction: isImageFacetActive
        ? false
        : !isNewProjectRef && canDeleteProject,
      showPublishAction: !isNewProjectRef,
    },
    lastSignature: lastFormActionsSignature,
  })
})

// Clear route-provided header form actions on unmount.
$effect(() => {
  return () => {
    resourceEditorPage.clearHeaderActions()
  }
})
</script>

<Main.Root>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={Boolean(formCtx.form?.fields && (project?.data || isNewProjectRef))}
    class="space-y-4"
  >
    <Main.Section isVisible={isCoreFacet} transition="fade">
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
          {@const formLocale = toLocaleKey(locale)}
          <FormI18nDescriptorFields
            form={formCtx.form}
            fields={formCtx.form.fields.data.i18n[formLocale]}
            {formLocale}
            {locale}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </FormI18nSection>

      <FormI18nSection
        title={m.admin__forms_project_credit()}
        subtitle={m.admin__forms_project_credit_subtitle()}
        {locales}
        {onTranslate}
        {onResetLocale}
        sectionKey="credit"
        {isEditing}
      >
        {#snippet children(locale)}
          {@const formLocale = toLocaleKey(locale)}
          <FormCreditFields
            form={formCtx.form}
            fields={formCtx.form.fields.data.i18n[formLocale] as never}
            {formLocale}
            {locale}
            {isEditing}
            {isRequiredInPreflight}
          />
        {/snippet}
      </FormI18nSection>

      <GridSpacer>
        {#snippet left()}
          <FormUserRolesSection
            title={m.admin__forms_project_members_title()}
            subtitle={m.admin__forms_project_members_subtitle()}
            userRoles={projectUserRoles as any}
            {hiddenUserIdInputAttrs}
            {roleFieldNameByUserId}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewProjectRef}
            availableRoles={[
              { value: ProjectRoleType.owner as any, label: m.profile__role_type__owner() },
              { value: ProjectRoleType.maintainer as any, label: 'Maintainer' },
              { value: ProjectRoleType.member as any, label: m.profile__role_type__member() },
              { value: ProjectRoleType.translator as any, label: 'Translator' },
              { value: ProjectRoleType.user as any, label: 'User' },
            ]}
            {onAddUser}
            {onRemoveUser}
            onRoleChange={onRoleChange as any}
          />
        {/snippet}

        {#snippet right()}
          <FormSpecifiersFields
            form={formCtx.form}
            fields={['code']}
            {isEditing}
            {isRequiredInPreflight}
          />
          {#if canSetParentOrganisation}
            <FormParentOrganisationSection
              title="Parent Organisation"
              subtitle="This project belongs to"
              parent={selectedParentOrganisation as any}
              hiddenOrganisationInputAttrs={hiddenParentOrganisationInputAttrs}
              {isEditing}
              isSubmitting={formCtx.submitting}
              isSubmitRequested={formCtx.isSubmitRequested}
              startInAddingMode={isNewProjectRef}
              onSearchOrganisations={onSearchParentOrganisations}
              onReplaceParent={onReplaceParentOrganisation}
            />
          {/if}
        {/snippet}
      </GridSpacer>
    </Main.Section>
    <Main.Section
      isVisible={isCapabilitiesFacet && hasAnyProjectCapabilitiesConfigured}
      transition="fade"
    >
      <ProjectCapabilities
        {capabilityIssues}
        availableCapabilityKeys={availableProjectCapabilityKeys}
        enabledCapabilityKeys={enabledProjectCapabilityKeys}
        capabilityLabelByKey={projectCapabilityLabelByKey}
        matrixRows={capabilityMatrixRows}
        {isEditing}
        onToggleCapability={onToggleProjectCapability}
        onToggleCell={onToggleUserCapability}
      />
    </Main.Section>
    <Main.Section
      isVisible={isFieldsFacet}
      transition="fade"
      class="bits-theme flex gap-4 min-h-0 flex-col"
    >
      {#each fieldSections as section (section.type)}
        <FormFieldsSection
          items={section.items}
          title={section.title}
          description={section.description}
          issues={section.issues}
          actions={section.actions}
          issueItemIds={section.issueItemIds}
          canEdit={canSubmitProject && isCurrentRefLoaded}
          {isEditing}
          removeMode={section.removeMode}
          onRemoveModeChange={value => {
            sectionRemoveModes[section.type] = value
          }}
          card={{
              removeMode: section.removeMode,
              locales,
              isEditing,
              isRequiredInPreflight,
              classifierComponents: classifierComponentTypes,
              specifierComponents: specifierComponentTypes,
              onIncreaseRank: section.actions.increaseRank,
              onDecreaseRank: section.actions.decreaseRank,
              onRemove: section.actions.remove,
              onUpdateBase: updatePropertyBase,
              onUpdateI18n: updatePropertyI18n,
              onAddValue: addPropertyValue,
              onRemoveValue: removePropertyValue,
              onMoveValue: movePropertyValue,
              onUpdateValueI18n: updatePropertyValueI18n,
              onTranslateLocale: onTranslatePropertyLocale,
              onResetLocale: onResetPropertyLocale,
              getPropertyIndex: (propertyId, _sectionIndex) =>
                getCurrentProjectProperties(projectPropertyFormAdapter).findIndex(
                  candidate => candidate.id === propertyId,
                ),
              getPropertyFields: (_propertyId, propertyIndex) =>
                getProjectPropertyFieldsForIndex(formCtx.form, propertyIndex),
            }}
        />
      {/each}
    </Main.Section>

    <div class="hidden" aria-hidden="true">
      {#each hiddenProjectCapabilityInputAttrs as inputAttrs, index (index)}
        <input {...inputAttrs}>
      {/each}
      {#each hiddenUserRoleCapabilityInputAttrs as inputAttrs, index (index)}
        <input {...inputAttrs}>
      {/each}
    </div>
  </Main.Form>
  <Main.Section
    isVisible={isImagesFacet}
    transition="fade"
    class="flex min-h-0 flex-col"
  >
    <EntityImage
      {page}
      entityId={project?.data?.id}
      {imageProviderProps}
      currentImage={activeProjectImage}
      ctx={project?.data?.id
        ? {
            ctxType: ImageContextResource.project,
            ctxId: project.data.id,
          }
        : undefined}
      canEditPresentationMode={canEditImagePresentationMode}
      canEditDropzone={canEditImageDropzone}
      {onPresentationModeCommitted}
    />
  </Main.Section>
</Main.Root>
