<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { untrack } from 'svelte'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleOrder, toOrganisationFormLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  createResourceEditorPage,
  createResourceFormConfig,
  getNameForToast,
  guardRefDesync,
  isFormLevelIssue,
  revalidateAfterSubmitAttempt,
  removeUserRoleSelection,
  resetLocaleFields,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
} from '$lib/client/services/form'
import {
  getProjectSubmitUpdates,
  overrideProjectEntityBoolean,
  overrideProjectListItemBoolean,
  resolveDefaultProjectOrganisationIdForCreate,
  seedOwnerRolesForNewProject as resolveOwnerRoleSeedForNewProject,
  toProjectFormInput,
} from '$lib/client/services/project'
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
  FormDataUpdaterForm,
  ImageCtxEnvelope,
  Locale,
  ProjectBooleanField,
  ProjectGetResponse,
  ProjectRoleUser,
  ResourceContext,
  User,
} from '$lib/types'

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = getAdminFacetTabsForResource(FirstClassResource.project)
const resolvedFacetTabs = $derived.by(() =>
  isNewProjectRef
    ? getAdminFacetTabsForResource(FirstClassResource.project, {
        coreOnly: true,
      })
    : facetTabs,
)

const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: ProjectIcon,
  facetTabs,
})

// § Config - Derived

const projectRef = $derived(page.params.project as string)
const locales = $derived(getLocaleOrder(getLocale()))
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
const isFieldsFacet = $derived(activeFacet === 'fields')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewProjectRef = $derived(projectRef === NEW_REF)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewProjectRef) return true
  return guardRefDesync(project as any, committedProject as any, projectRef)
})

// § Form

type ProjectI18nSectionKey = 'descriptor' | 'credit'
const translatableI18nFieldsBySection: Record<
  ProjectI18nSectionKey,
  ReadonlyArray<'name' | 'nameShort' | 'description' | 'license' | 'attribution'>
> = {
  descriptor: ['name', 'nameShort', 'description'],
  credit: ['license', 'attribution'],
}
const configuredProjectForm = configureForm(() => ({
  form: projectForm as any,
  ...createResourceFormConfig({
    formEl: contentsElement,
    key: projectRef,
    schema: ProjectPreflightFormData,
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
      const submittedCode = data.data?.code?.trim() ?? ''
      const refreshed = await refreshProject(shouldRedirect ? submittedCode : undefined)
      commitProjectState(refreshed)
      if (refreshed?.data) {
        formCtx.form.fields.set(toProjectFormInput(refreshed.data))
      }
    },
  }),
}))

const formCtx = $derived(configuredProjectForm())
const isRequiredInPreflight = createSchemaRequiredInferer(ProjectPreflightFormData)
const isDirty = $derived(Boolean(formCtx.dirty))

const visibleAllIssues = $derived.by((): unknown[] =>
  suppressFormLevelIssues ? [] : (formCtx.allIssues ?? []),
)

const formLevelIssues = $derived.by((): string[] => {
  const messages = visibleAllIssues
    .filter(isFormLevelIssue)
    .map(toIssueMessage)
    .filter((message: string | null): message is string => Boolean(message))
  return Array.from(new Set(messages))
})

// USER ROLES

const formUserRoleValues = $derived(
  (formCtx.form.fields.value().data?.userRoles ?? []) as Array<{
    userId: string
    role: string
  }>,
)
const userRoleUpdaterForm = $derived(
  formCtx.form as unknown as FormDataUpdaterForm<{
    userRoles?: Array<{ userId: string; role: string }>
  }>,
)
const hiddenUserIdInputAttrs = $derived.by(() => {
  const rows = (formCtx.form as any).fields?.data?.userRoles ?? []
  return formUserRoleValues
    .map((userRole, index) => {
      const userId = typeof userRole.userId === 'string' ? userRole.userId : ''
      if (!userId) return null
      return rows[index]?.userId?.as('hidden', userId)
    })
    .filter(Boolean) as Array<Record<string, unknown>>
})
const roleFieldNameByUserId = $derived.by(() => {
  const rows = (formCtx.form as any).fields?.data?.userRoles ?? []
  return Object.fromEntries(
    formUserRoleValues.map((userRole, index) => [
      userRole.userId,
      rows[index]?.role?.as('select')?.name ?? '',
    ]),
  ) as Record<string, string>
})

const projectUserRoles = $derived.by(() => {
  const baseRoles = (project?.data?.userRoles ?? []) as ProjectRoleUser[]
  const roleByUserId = new Map(formUserRoleValues.map(role => [role.userId, role.role]))

  return formUserRoleValues.flatMap(formUserRole => {
    const baseRole = baseRoles.find(userRole => userRole.userId === formUserRole.userId)
    if (baseRole) {
      return [
        {
          ...baseRole,
          role: roleByUserId.get(formUserRole.userId) ?? baseRole.role,
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
            project: hierarchy.project,
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
    form: formCtx.form as any,
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
    form: formCtx.form as any,
    targetLocale,
    fields: [...translatableI18nFieldsBySection[section]],
  })
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
  } as any)
  revalidateAfterProgrammaticChange()
}

function onRemoveUser(userId: string): void {
  const { [userId]: _removedUser, ...rest } = selectedUsersById
  selectedUsersById = rest
  project = removeUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: project,
    userId,
  } as any)
  revalidateAfterProgrammaticChange()
}

function onRoleChange(userId: string, role: ProjectRoleType): void {
  project = updateUserRoleSelection({
    form: userRoleUpdaterForm,
    entity: project,
    userId,
    role,
  } as any)
  revalidateAfterProgrammaticChange()
}

function onReplaceParentOrganisation(
  organisation: ParentSectionOrganisationItem,
): void {
  selectedParentOrganisationById = {
    [organisation.id]: organisation,
  }
  updateFormData(formCtx.form as any, (data: any) => {
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
        const nextFacet = adminCtx.activeFacet === 'images' ? 'images' : 'core'
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
    project?.data?.i18n?.[getLocale()]?.name ??
    project?.data?.code ??
    m.deft_mealy_ant_vent()
  const facetKey = Array.from(resolvedFacetTabs.keys()).join('|')
  const headerKey = `${ref}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  headerCtrl.setHeaderForEntity(title, ProjectIcon, resolvedFacetTabs as any)
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
    updateFormData(formCtx.form as any, (data: any) => {
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
      await getOrganisation({
        ref: targetOrganisationId,
        refKey: 'id',
        meta: { isAdminRequest: true, profile: 'admin' },
      }),
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
    updateFormData(formCtx.form as any, (data: any) => {
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
  <Main.Section isVisible={isCoreFacet} transition="fade">
    <Main.Form
      bind:formEl={contentsElement}
      attrs={formCtx.attributes}
      isReady={Boolean(formCtx.form?.fields && (project?.data || isNewProjectRef))}
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
          {@const formLocale = toOrganisationFormLocaleKey(locale)}
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
          {@const formLocale = toOrganisationFormLocaleKey(locale)}
          <FormCreditFields
            fields={formCtx.form.fields.data.i18n[formLocale]}
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
    </Main.Form>
  </Main.Section>

  <Main.Section
    isVisible={isFieldsFacet}
    transition="fade"
    class="flex min-h-0 flex-col"
  > </Main.Section>

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
      {onPresentationModeCommitted}
    />
  </Main.Section>
</Main.Root>
