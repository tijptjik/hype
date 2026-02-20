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
  getNameForToast,
  getRoleFieldNameByUserId,
  guardRefDesync,
  guardUserRolesDesync,
  isFormLevelIssue,
  revalidateAfterSubmitAttempt,
  resetLocaleFields,
  removeUserRoleSelection,
  toIssueMessage,
  translateLocaleIntoEmptyFields,
  updateUserRoleSelection,
} from '$lib/client/services/form'
import {
  getOrganisationSubmitUpdates,
  overrideOrganisationEntityBoolean,
  overrideOrganisationListItemBoolean,
  toOrganisationFormInput,
} from '$lib/client/services/organisation'
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
// CONFIG
import { NEW_REF, NEW_TITLE } from '$lib/constants'
// BITS COMPONENTS
import {
  FormI18nDescriptorFields,
  FormI18nSection,
  FormSpecifiersFields,
  FormUserRolesSection,
  GridSpacer,
  Main,
} from '$lib/bits'
import { SectionHeaderPrimitive } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
// NAVIGATION
import { navigateOnAdmin } from '$lib/navigation'
// UTILS
import { createSchemaRequiredInferer, toIssueMessages } from '$lib/utils/form-schema'
// ICONS
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import FormInputIcon from 'virtual:icons/lucide/form-input'
import ImageIcon from 'virtual:icons/lucide/image'
// ENUMS
import { FirstClassResource, OrganisationRoleType } from '$lib/enums'
// TYPES
import type {
  Locale,
  User,
  OrganisationFormInput,
  OrganisationGetState,
  OrganisationRoleUser,
  OrganisationToggleField,
} from '$lib/types'

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § Config

const facetTabs = new Map([
  ['core', { label: m.resources__profile(), icon: FormInputIcon }],
  ['images', { label: m.organisation__images(), icon: ImageIcon }],
] as const)

const resourceEditorPage = createResourceEditorPage({
  headerCtrl,
  icon: OrganisationIcon,
  facetTabs,
})

// § Config - Derived

const organisationRef = $derived(page.params.organisation as string)
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
let hasAutoEnteredEditForNew = $state(false)

// § State - Data

let organisation: OrganisationGetState = $state(null)
let committedOrganisation: OrganisationGetState = $state(null)

const commitOrganisationState = (value: OrganisationGetState): void => {
  committedOrganisation = value
  organisation = value
}

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isNewOrganisationRef = $derived(organisationRef === NEW_REF)

// Desync Guard
const isCurrentRefLoaded = $derived.by(() => {
  if (isNewOrganisationRef) return true
  return guardRefDesync(organisation, committedOrganisation, organisationRef)
})

// § Form

const translatableI18nFields = ['name', 'nameShort', 'description'] as const
const configuredOrganisationForm = configureForm<OrganisationFormInput>(() => ({
  form: organisationForm,
  ...createResourceFormConfig<OrganisationFormInput>({
    formEl: contentsElement,
    key: organisationRef,
    schema: OrganisationPreflightFormData,
    // Keep form source anchored to the committed entity snapshot so
    // optimistic view-only entity tweaks (e.g. role UI rows) cannot
    // rehydrate stale i18n values back into the live form.
    data: toOrganisationFormInput(committedOrganisation?.data),
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
      commitOrganisationState(refreshed)
      if (refreshed?.data) {
        formCtx.form.fields.set(toOrganisationFormInput(refreshed.data))
      }
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
const hiddenUserIdInputAttrs = $derived(
  getUserRoleHiddenInputAttrs(formCtx.form, formUserRoleValues),
)
const userRoles = $derived.by(() =>
  guardUserRolesDesync({
    baseRoles: (organisation?.data?.userRoles ?? []) as OrganisationRoleUser[],
    formUserRoles: formUserRoleValues,
    organisationId: organisation?.data?.id,
    usersById: selectedUsersById,
  }),
)

// § Auth

const currentUser = $derived(adminCtx.appCtx.getUser())
const currentHub = $derived(adminCtx.appCtx.hub)
const currentActor = $derived(toOrganisationAuthActor(currentUser))
const organisationPermissions = $derived.by(() => {
  const organisationData = organisation?.data
  const newEntityHubId = currentHub?.isCore ? null : (currentHub?.id ?? null)
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
const canSubmitOrganisation = $derived(
  isNewOrganisationRef ? canCreateOrganisation : canEditOrganisation,
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
    form: formCtx.form,
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
    form: formCtx.form,
    entity: organisation,
    userId,
  })
  revalidateAfterProgrammaticChange()
}

function onRoleChange(userId: string, role: OrganisationRoleType): void {
  organisation = updateUserRoleSelection({
    form: formCtx.form,
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
  return await getOrganisation({
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
  field: OrganisationToggleField
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
    commitOrganisationState(await refreshOrganisation())
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
  if (!isCurrentRefLoaded) return
  const baseMeta = committedOrganisation?.data
    ? (toOrganisationFormInput(committedOrganisation.data).meta ?? {})
    : undefined
  formCtx.requestSubmit(baseMeta ? { meta: baseMeta } : undefined)
}

// § Effects

// Keep facet + entity data in sync with the current route ref.
$effect(() => {
  const ref = organisationRef
  return resourceEditorPage.syncRouteAndLoad({
    ref,
    resetFormActionsSignature: () => {
      lastFormActionsSignature = ''
      suppressFormLevelIssues = true
    },
    setFacetForRef: nextRef => {
      untrack(() => {
        adminCtx.setFacet('core', nextRef, FirstClassResource.organisation)
      })
    },
    load: refreshOrganisation,
    commit: commitOrganisationState,
  })
})

// Keep entity header metadata (title/icon/facets) aligned with loaded organisation data.
$effect(() => {
  const ref = organisationRef
  const title =
    (isNewOrganisationRef ? `${NEW_TITLE} ${m.any_small_midge_aim()}` : undefined) ??
    organisation?.data?.i18n?.[getLocale()]?.name ??
    organisation?.data?.code ??
    m.any_small_midge_aim()
  resourceEditorPage.syncHeader({
    ref,
    title,
    lastHeaderKey,
    setLastHeaderKey: next => {
      lastHeaderKey = next
    },
  })
})

// Archived entities are read-only until restored.
$effect(() => {
  if (!organisation?.data?.isArchived) return
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
  if (canSubmitOrganisation) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
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
  const dirty = isDirty
  const isSubmitting = formCtx.submitting
  const hasIssues = visibleAllIssues.length > 0
  const isPublished = Boolean(organisation?.data?.isPublished)
  const isDeleted = Boolean(organisation?.data?.isArchived)
  lastFormActionsSignature = resourceEditorPage.syncHeaderStatus({
    headerCtrl,
    status: {
      dirty,
      isSubmitting,
      hasIssues,
      isPublished,
      isDeleted,
      canEdit: canSubmitOrganisation && isCurrentRefLoaded,
      canPublish: !isNewOrganisationRef && canPublishOrganisation && isCurrentRefLoaded,
      showDeleteAction: !isNewOrganisationRef,
      showPublishAction: !isNewOrganisationRef,
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
  <Main.Section isVisible={isCoreFacet}>
    <Main.Form
      bind:formEl={contentsElement}
      attrs={formCtx.attributes}
      isReady={Boolean(formCtx.form?.fields && (organisation?.data || isNewOrganisationRef))}
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

      <GridSpacer>
        {#snippet left()}
          {@const roleFieldNameByUserId = getRoleFieldNameByUserId(formCtx.form)}
          <FormUserRolesSection
            title={m.admin__forms_organisation_members_title()}
            subtitle={m.admin__forms_organisation_members_subtitle()}
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
    </Main.Form>
  </Main.Section>
  <Main.Section isVisible={isImagesFacet}>
    <p class="text-sm text-neutral-content">Active tab: profile image management.</p>
  </Main.Section>
</Main.Root>
