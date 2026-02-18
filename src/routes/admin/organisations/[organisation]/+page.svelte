<script lang="ts">
// SVELTE
import { page } from '$app/state'
import { dev } from '$app/environment'
import { untrack } from 'svelte'
// I18N
import { m } from '$lib/i18n'
import { getLocale, getLocaleOrder, toOrganisationFormLocaleKey } from '$lib/i18n'
// TOAST
import { toast } from 'svelte-sonner'
// SERVICES
import {
  addUserRoleSelection,
  getGenAiState,
  getNameForToast,
  getRoleFieldNameByUserId,
  handleResourceFormSubmissionResult,
  resetLocaleFields,
  removeUserRoleSelection,
  syncHeaderFormActionStatus,
  toggleEntityDataBoolean,
  toggleGenAiField,
  translateLocaleIntoEmptyFields,
  updateUserRoleSelection,
  wireHeaderFormActionHandlers,
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
// SCHEMA
import { OrganisationPreflightFormData } from '$lib/db/zod'
// BITS COMPONENTS
import {
  FormI18nSection,
  FormSection,
  FormUserRolesSection,
  GridSpacer,
} from '$lib/bits'
import { FormDebug, SectionHeader, TextArea, TextInput } from '$lib/bits/custom/form'
// FACTORIES
import { configureForm } from '$lib/factories.svelte'
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
  UserSearchQueryOptions,
} from '$lib/types'

// § Config

const facetTabs = new Map([
  ['core', { label: m.resources__profile(), icon: FormInputIcon }],
  ['images', { label: m.organisation__images(), icon: ImageIcon }],
] as const)
const userQueryParams: UserSearchQueryOptions = {
  pagination: { limit: 20, offset: 0 },
  sorting: { sortBy: 'name', sortOrder: 'asc' },
}
const translatableI18nFields = ['name', 'nameShort', 'description'] as const

// § Context

const adminCtx = getAdminCtx()
const headerCtrl = getHeaderCtrl()

// § State - Elements

let contentsElement: HTMLFormElement | undefined = $state()

// § State - State

let lastHeaderKey = $state('')
let lastFormActionsSignature = $state('')

// § State - Data

let organisation = $state<OrganisationGetState>(null)

// § Derived State - Config

const organisationRef = $derived(page.params.organisation as string)
const orderedLocales = $derived(getLocaleOrder(getLocale()))
const activeFacet = $derived(
  adminCtx.activeFacet === false ? 'core' : adminCtx.activeFacet,
)
const flags = $derived(
  organisation?.data?.hubId != null
    ? [
        {
          key: 'isHubExclusive',
          label: m.long_fit_vole_flow(),
          checked: Boolean(organisation.data.isHubExclusive),
          isEditing: headerCtrl.state.isEditing,
          isNullable: false,
          onCheckedChange: (nextChecked: boolean | null) => {
            organisation = toggleEntityDataBoolean(
              organisation,
              'isHubExclusive',
              nextChecked,
            )
          },
        },
      ]
    : [],
)

// § Form

const configuredOrganisationForm = configureForm<OrganisationFormInput>(() => ({
  form: organisationForm,
  formEl: contentsElement,
  key: organisation?.data?.id ?? organisationRef,
  schema: OrganisationPreflightFormData,
  data: organisation?.data ? toOrganisationFormInput(organisation.data) : undefined,
  onsubmitupdates: ({ data }) =>
    getOrganisationSubmitUpdates({
      data,
      locale: getLocale(),
      organisationId: organisation?.data?.id,
      entityQuery: getOrganisation({ ref: organisationRef, refKey: 'code' }),
      listQuery: getOrganisations({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
      }),
    }),
  onresult: async ({ success, issues, error }) => {
    await handleResourceFormSubmissionResult({
      success,
      issues,
      error,
      nameKey: 'nameShort',
      nameFallbackKey: 'code',
      headerCtrl,
      refreshResource: async () => {
        const refreshed = await refreshOrganisation()
        organisation = refreshed
        if (refreshed?.data) {
          formCtx.form.fields.set(toOrganisationFormInput(refreshed.data))
        }
      },
      entity: organisation,
    })
  },
}))

const formCtx = $derived(configuredOrganisationForm())
const isRequiredInPreflight = createSchemaRequiredInferer(OrganisationPreflightFormData)

// § Derived State - Flags

const isCoreFacet = $derived(activeFacet === 'core')
const isImagesFacet = $derived(activeFacet === 'images')
const isEditing = $derived(headerCtrl.state.isEditing)
const isDirty = $derived(Boolean(formCtx.dirty))

// § Handlers

// i18N CARDS

async function handleTranslateLocale(
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<void> {
  await translateLocaleIntoEmptyFields({
    form: formCtx.form,
    sourceLocale,
    targetLocale,
    fields: [...translatableI18nFields],
  })
}

function handleResetLocale(targetLocale: Locale): void {
  resetLocaleFields({
    form: formCtx.form,
    targetLocale,
    fields: [...translatableI18nFields],
  })
}

// USER ROLES

function handleAddOrganisationUser(user: User): void {
  organisation = addUserRoleSelection({
    form: formCtx.form,
    entity: organisation,
    user,
    defaultRole: OrganisationRoleType.member,
    foreignKey: 'organisationId',
  })
}

function handleRemoveOrganisationUser(userId: string): void {
  organisation = removeUserRoleSelection({
    form: formCtx.form,
    entity: organisation,
    userId,
  })
}

function handleOrganisationRoleChange(
  userId: string,
  role: OrganisationRoleType,
): void {
  organisation = updateUserRoleSelection({
    form: formCtx.form,
    entity: organisation,
    userId,
    role,
  })
}

// RESOURCE STATE

async function refreshOrganisation(
  ref: string = organisationRef,
): Promise<OrganisationGetState> {
  return await getOrganisation({ ref, refKey: 'code' }).catch(() => null)
}

async function handlePublishOrganisation(): Promise<void> {
  if (!organisation || !organisation.data) return
  const nextState = !organisation.data.isPublished

  headerCtrl.setPublishing(true)

  try {
    await publishOrganisation({
      id: organisation.data.id,
      state: nextState,
    }).updates(
      getOrganisation({ ref: organisationRef, refKey: 'code' }).withOverride(
        overrideOrganisationEntityBoolean('isPublished', nextState),
        // TODO Invalidate cache
      ),
      getOrganisations({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
      }).withOverride(
        overrideOrganisationListItemBoolean(
          organisation.data.id,
          'isPublished',
          nextState,
        ),
        // TODO Invalidate cache
      ),
    )
    organisation = await refreshOrganisation()

    toast.success(
      `${nextState ? 'Published' : 'Unpublished'} ${getNameForToast(organisation, 'nameShort')}`,
    )
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    headerCtrl.setPublishing(false)
  }
}

async function handleDeleteOrganisation(): Promise<void> {
  if (!organisation || !organisation.data) return
  const nextState = !organisation.data.isArchived

  headerCtrl.setDeleting(true)

  try {
    await archiveOrganisation({
      id: organisation.data.id,
      state: nextState,
    }).updates(
      getOrganisation({ ref: organisationRef, refKey: 'code' }).withOverride(
        overrideOrganisationEntityBoolean('isArchived', nextState),
        // TODO Invalidate cache
      ),
      getOrganisations({
        conditions: adminCtx.appCtx.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.appCtx.state.prisms,
      }).withOverride(
        overrideOrganisationListItemBoolean(
          organisation.data.id,
          'isArchived',
          nextState,
        ),
        // TODO Invalidate cache
      ),
    )
    organisation = await refreshOrganisation()

    toast.success(
      `${nextState ? 'Removed' : 'Restored'} ${getNameForToast(organisation, 'nameShort')}`,
    )
  } catch {
    toast.error(m.long_crazy_peacock_care())
  } finally {
    headerCtrl.setDeleting(false)
  }
}

function handleHeaderFormReset(): void {
  if (organisation?.data) {
    formCtx.form.fields.set(toOrganisationFormInput(organisation.data))
    return
  }
  formCtx.reset()
}

function handleHeaderFormSubmit(): void {
  contentsElement?.requestSubmit()
}

function handleHeaderPublishToggle(): void {
  void handlePublishOrganisation()
}

function handleHeaderDeleteToggle(): void {
  void handleDeleteOrganisation()
}

// § Effects

// Keep facet + entity data in sync with the current route ref.
$effect(() => {
  const ref = organisationRef
  let cancelled = false
  lastFormActionsSignature = ''

  untrack(() => {
    adminCtx.setFacet('core', ref, FirstClassResource.organisation)
  })

  void refreshOrganisation(ref).then(result => {
    if (cancelled) return
    organisation = result
  })

  return () => {
    cancelled = true
  }
})

// Keep entity header metadata (title/icon/facets) aligned with loaded organisation data.
$effect(() => {
  const ref = organisationRef
  const title =
    organisation?.data?.i18n?.[getLocale()]?.name ??
    organisation?.data?.code ??
    m.any_small_midge_aim()
  const headerKey = `${ref}:${title}`

  if (headerKey === lastHeaderKey) return
  lastHeaderKey = headerKey

  headerCtrl.setHeaderForEntity(title, OrganisationIcon, facetTabs)
})

// Archived entities are read-only until restored.
$effect(() => {
  if (!organisation?.data?.isArchived) return
  if (!headerCtrl.state.isEditing) return
  headerCtrl.setEditing(false)
})

// Wire stable header action handlers once.
$effect(() => {
  wireHeaderFormActionHandlers({
    headerCtrl,
    handlers: {
      reset: handleHeaderFormReset,
      submit: handleHeaderFormSubmit,
      togglePublish: handleHeaderPublishToggle,
      toggleDelete: handleHeaderDeleteToggle,
    },
  })
})

// Push reactive form/resource status state into shared header controls.
$effect(() => {
  const dirty = isDirty
  const isSubmitting = formCtx.submitting
  const hasIssues = (formCtx.allIssues?.length ?? 0) > 0
  const isPublished = Boolean(organisation?.data?.isPublished)
  const isDeleted = Boolean(organisation?.data?.isArchived)
  lastFormActionsSignature = syncHeaderFormActionStatus({
    headerCtrl,
    status: {
      dirty,
      isSubmitting,
      hasIssues,
      isPublished,
      isDeleted,
    },
    lastSignature: lastFormActionsSignature,
  })
})

// Clear route-provided header form actions on unmount.
$effect(() => {
  return () => {
    headerCtrl.clearFormActions()
  }
})
</script>

<main class="h-full overflow-y-auto p-6">
  <section class:hidden={!isCoreFacet}>
    <form
      bind:this={contentsElement}
      {...formCtx.attributes}
      class="bits-theme space-y-4"
    >
      {#if formCtx.form?.fields && organisation?.data}
        <FormI18nSection
          title={m.admin__forms_common_descriptors()}
          locales={orderedLocales}
          onTranslate={handleTranslateLocale}
          onResetLocale={handleResetLocale}
          {isEditing}
          {flags}
        >
          {#snippet children(locale)}
            {@const formLocale = toOrganisationFormLocaleKey(locale)}
            {@const fields = formCtx.form.fields.data.i18n[formLocale]}
            {@const nameInputAttrs = fields.name.as('text')}
            {@const nameRequired = isRequiredInPreflight(['data', 'i18n', formLocale, 'name'])}
            {@const nameIssues = toIssueMessages(fields.name.issues())}
            {@const nameShortInputAttrs = fields.nameShort.as('text')}
            {@const nameShortRequired = isRequiredInPreflight(['data', 'i18n', formLocale, 'nameShort'])}
            {@const nameShortIssues = toIssueMessages(fields.nameShort.issues())}
            {@const descriptionTextAreaAttrs = fields.description.as('text')}
            {@const descriptionRequired = isRequiredInPreflight(['data', 'i18n', formLocale, 'description'])}
            {@const descriptionIssues = toIssueMessages(fields.description.issues())}

            <TextInput
              label={m.admin__forms_common_name_full()}
              {locale}
              isTranslated={true}
              required={nameRequired}
              {isEditing}
              isGenAI={getGenAiState(formCtx.form, locale, 'name')}
              onToggleGenAI={() => toggleGenAiField(formCtx.form, locale, 'name')}
              value={(nameInputAttrs as { value?: string }).value ?? ''}
              issues={nameIssues}
              inputAttrs={nameInputAttrs as Record<string, unknown>}
            />

            <TextInput
              label={m.admin__forms_common_name_short()}
              {locale}
              isTranslated={true}
              required={nameShortRequired}
              {isEditing}
              isGenAI={getGenAiState(formCtx.form, locale, 'nameShort')}
              onToggleGenAI={() => toggleGenAiField(formCtx.form, locale, 'nameShort')}
              value={(nameShortInputAttrs as { value?: string }).value ?? ''}
              issues={nameShortIssues}
              inputAttrs={nameShortInputAttrs as Record<string, unknown>}
            />

            <TextArea
              label="Description"
              {locale}
              isTranslated={true}
              required={descriptionRequired}
              {isEditing}
              isGenAI={getGenAiState(formCtx.form, locale, 'description')}
              onToggleGenAI={() => toggleGenAiField(formCtx.form, locale, 'description')}
              value={(descriptionTextAreaAttrs as { value?: string }).value ?? ''}
              issues={descriptionIssues}
              textareaAttrs={descriptionTextAreaAttrs as Record<string, unknown>}
            />
          {/snippet}
        </FormI18nSection>

        <GridSpacer>
          {#snippet left()}
            {@const userRoleValues = formCtx.form.fields.value().data?.userRoles ?? []}
            {@const roleFieldNameByUserId = getRoleFieldNameByUserId(formCtx.form)}
            <FormUserRolesSection
              title={m.admin__forms_organisation_members_title()}
              subtitle={m.admin__forms_organisation_members_subtitle()}
              userRoles={organisation?.data?.userRoles ?? []}
              {roleFieldNameByUserId}
              {userQueryParams}
              {isEditing}
              onAddUser={handleAddOrganisationUser}
              onRemoveUser={handleRemoveOrganisationUser}
              onRoleChange={handleOrganisationRoleChange}
            />
            <div class="hidden" aria-hidden="true">
              {#each userRoleValues as _userRole, index (index)}
                {@const userRoleField = (formCtx.form.fields.data.userRoles as any)[index]}
                <input {...userRoleField.userId.as('hidden', _userRole.userId)}>
              {/each}
            </div>
          {/snippet}

          {#snippet right()}
            {@const codeInputAttrs = formCtx.form.fields.data.code.as('text')}
            {@const codeRequired = isRequiredInPreflight(['data', 'code'])}
            {@const codeIssues = toIssueMessages(formCtx.form.fields.data.code.issues())}
            {@const urlInputAttrs = formCtx.form.fields.data.url.as('url')}
            {@const urlRequired = isRequiredInPreflight(['data', 'url'])}
            {@const urlIssues = toIssueMessages(formCtx.form.fields.data.url.issues())}
            <section class="bits-form__section">
              <SectionHeader title={m.admin__forms_common_specifiers()} />
              <FormSection>
                <TextInput
                  label="Code"
                  required={codeRequired}
                  {isEditing}
                  value={(codeInputAttrs as { value?: string }).value ?? ''}
                  issues={codeIssues}
                  inputAttrs={codeInputAttrs as Record<string, unknown>}
                />

                <TextInput
                  label="Url"
                  required={urlRequired}
                  {isEditing}
                  value={(urlInputAttrs as { value?: string }).value ?? ''}
                  issues={urlIssues}
                  inputAttrs={urlInputAttrs as Record<string, unknown>}
                />
              </FormSection>
            </section>
          {/snippet}
        </GridSpacer>
      {/if}
    </form>
    {#if dev}
      <FormDebug form={formCtx.form} />
    {/if}
  </section>
  <section class:hidden={!isImagesFacet}>
    <p class="text-sm text-neutral-content">Active tab: profile image management.</p>
  </section>
</main>
