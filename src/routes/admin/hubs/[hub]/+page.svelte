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
  getUserRoleHiddenInputAttrs,
  getRoleFieldNameByUserId,
  guardRefDesync,
  isFormLevelIssue,
  revalidateAfterSubmitAttempt,
  removeUserRoleSelection,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateFormData,
  updateUserRoleSelection,
  resetLocaleFields,
} from '$lib/client/services/form'
import {
  getHubOrganisationHiddenInputAttrs,
  getHubSubmitUpdates,
  overrideHubEntityBoolean,
  overrideHubListItemBoolean,
  toHubFormInput,
} from '$lib/client/services/hub'
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
import { HubPreflightFormData } from '$lib/db/zod'
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  EntityImage,
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
import { getAdminFacetTabsForResource, navigateOnAdmin } from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer } from '$lib/utils/form-schema'
// ICONS
import HubIcon from 'virtual:icons/lucide/building-2'
// ENUMS
import { FirstClassResource, HubRoleType, ImageContextResource } from '$lib/enums'
// TYPES
import type {
  ImageCtxEnvelope,
  Locale,
  HubRoleUser,
  User,
  UserRoleFieldNameResolverForm,
  HubOrganisationFieldNameResolverForm,
  FormDataUpdaterForm,
} from '$lib/types'

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
const locales = $derived(getLocaleOrder(getLocale()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')
let suppressFormLevelIssues = $state(false)
let selectedUsersById = $state<Record<string, User>>({})
let selectedOrganisationsById = $state<Record<string, any>>({})
let hasAutoEnteredEditForNew = $state(false)

// § State - Data

type HubGetState = any
let hub: HubGetState = $state(null)
let committedHub: HubGetState = $state(null)

const commitHubState = (value: HubGetState): void => {
  committedHub = value
  hub = value
}

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewHubRef = $derived(hubRef === NEW_REF)

const isCurrentRefLoaded = $derived.by(() => {
  if (isNewHubRef) return true
  return guardRefDesync(hub as any, committedHub as any, hubRef)
})

// § Form

const translatableI18nFields = ['name', 'nameShort', 'description'] as const
const configuredHubForm = configureForm<any>(() => ({
  form: hubForm as any,
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
      commitHubState(refreshed)
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
const organisationResolverForm = $derived(
  formCtx.form as unknown as HubOrganisationFieldNameResolverForm,
)
const hiddenOrganisationInputAttrs = $derived(
  getHubOrganisationHiddenInputAttrs(organisationResolverForm, formOrganisationValues),
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
const canEditImagePresentationMode = $derived(canSubmitHub && isCurrentRefLoaded)
const canSetCoreInclusive = $derived(canCreateHub)
const allowedOrganisationIds = $derived.by(() => {
  if (adminCtx.appCtx.isSuperAdmin()) return null
  const user = adminCtx.appCtx.getUser()
  const roles = Array.isArray(user?.roles) ? user.roles : []
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
  updateFormData(formCtx.form as any, (data: any) => {
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
  updateFormData(formCtx.form as any, (data: any) => {
    data.organisations = (data.organisations ?? []).filter(
      (item: any) => item.organisationId !== organisationId,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

function onToggleCoreInclusive(organisationId: string, nextValue: boolean): void {
  if (!canSetCoreInclusive) return
  updateFormData(formCtx.form as any, (data: any) => {
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
  updateFormData(formCtx.form as any, (data: any) => {
    data.organisations = (data.organisations ?? []).map((item: any) =>
      item.organisationId === organisationId
        ? { ...item, isHubExclusive: nextValue }
        : item,
    )
    return data
  })
  revalidateAfterProgrammaticChange()
}

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
  return (result.data as any[]).map(organisation => {
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
  return await getHub({
    ref,
    refKey: 'code',
    meta: { isAdminRequest: true, profile: 'detail' },
  }).catch(() => null)
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

    commitHubState(await refreshHub())
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
  const baseMeta = committedHub?.data
    ? (toHubFormInput(committedHub.data).meta ?? {})
    : undefined
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

function onPresentationModeCommitted(nextMode: 'cover' | 'contain'): void {
  if (!canEditImagePresentationMode) return
  if (hub?.data?.image) {
    hub.data.image.image.presentationMode = nextMode
  }
  if (committedHub?.data?.image) {
    committedHub.data.image.image.presentationMode = nextMode
  }
}

// § Effects

$effect(() => {
  const ref = hubRef
  return resourceEditorPage.syncRouteAndLoad({
    ref,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        const nextFacet = adminCtx.activeFacet === 'images' ? 'images' : 'core'
        adminCtx.setFacet(nextFacet, nextRef, FirstClassResource.hub)
      })
    },
    load: refreshHub,
    commit: commitHubState,
  })
})

$effect(() => {
  const ref = hubRef
  const title =
    (isNewHubRef ? `${NEW_TITLE} ${m.hub__title()}` : undefined) ??
    hub?.data?.i18n?.[getLocale()]?.name ??
    hub?.data?.code ??
    m.hub__title()
  const facetKey = Array.from(resolvedFacetTabs.keys()).join('|')
  const headerKey = `${ref}:${title}:${facetKey}`
  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey
  headerCtrl.setHeaderForEntity(title, HubIcon, resolvedFacetTabs)
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
  const dirty = isDirty
  const isSubmitting = formCtx.submitting
  const hasIssues = visibleAllIssues.length > 0
  const isPublished = Boolean(hub?.data?.isPublished)
  const isDeleted = Boolean(hub?.data?.isArchived)

  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
    headerCtrl,
    status: {
      dirty: isImageFacetActive ? false : dirty,
      isSubmitting: isImageFacetActive ? false : isSubmitting,
      hasIssues: isImageFacetActive ? false : hasIssues,
      isPublished,
      isDeleted,
      canEdit: isImageFacetActive ? false : canSubmitHub && isCurrentRefLoaded,
      canPublish: !isNewHubRef && canPublishHub && isCurrentRefLoaded,
      showDeleteAction: isImageFacetActive ? false : !isNewHubRef && canDeleteHub,
      showPublishAction: !isNewHubRef,
    },
    lastSignature: lastFormActionsSignature,
  })
})

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
      isReady={Boolean(formCtx.form?.fields && (hub?.data || isNewHubRef))}
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

      <GridSpacer cols={3} leftCols={1} centerCols={1} rightCols={1}>
        {#snippet left()}
          {@const roleFieldNameByUserId = getRoleFieldNameByUserId(userRoleResolverForm)}
          <FormUserRolesSection
            title={m.admin__forms_hub_admins_title()}
            subtitle={m.admin__forms_hub_admins_subtitle()}
            userRoles={hubUserRoles as any}
            {roleFieldNameByUserId}
            {hiddenUserIdInputAttrs}
            {isEditing}
            isSubmitting={formCtx.submitting}
            isSubmitRequested={formCtx.isSubmitRequested}
            startInAddingMode={isNewHubRef}
            availableRoles={[{ value: HubRoleType.admin as any, label: 'Admin' }]}
            userQueryParams={{
              conditions: { isArchived: false },
            }}
            {onAddUser}
            {onRemoveUser}
            onRoleChange={onRoleChange as any}
          />
        {/snippet}

        {#snippet center()}
          <FormOrganisationsSection
            title={m.maps__organisations()}
            subtitle={m.hub__organisations_note()}
            organisations={hubOrganisations as any}
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
    </Main.Form>
  </Main.Section>

  <Main.Section isVisible={isImagesFacet} transition="fade">
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
      {onPresentationModeCommitted}
    />
  </Main.Section>
</Main.Root>
