<script lang="ts">
// ORGANISATION USERS
import OrganisationUserSettings from '#lib/bits/patterns/organisationUsers/OrganisationUserSettings.svelte'
import OrganisationUsers from '#lib/bits/patterns/organisationUsers/OrganisationUsers.svelte'
import {
  DEFAULT_ORGANISATION_USER_POLICY,
  OrganisationUserPolicyFormSchema,
} from '#lib/organisation-users/policy.js'
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'
import { runRemoteQuery } from '#lib/remote/index.js'
// MESSAGING
import OrganisationMessaging from '#lib/bits/patterns/messaging/OrganisationMessaging.svelte'
import { canManageOrganisationMessaging } from '#lib/api/services/authz/messaging.js'
// PROFILE
import FormI18nDescriptorProfile from '#lib/bits/patterns/forms/formI18nSection/FormI18nDescriptorProfile.svelte'
import { translateContentField } from '#lib/api/translation.remote.js'
// BITS COMPONENTS
import LocationVisibilitySelect from '#lib/bits/patterns/forms/featureLocation/LocationVisibilitySelect.svelte'
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
// PUBLICATION
import { publicationPreviewUrl } from '#lib/publication/preview.js'
import { canPreviewPublication } from '#lib/publication/permissions.js'
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
  removeUserRoleSelection,
  resolveOptimisticHeaderFacets,
  resolveOptimisticHeaderStatus,
  resolveFacetTabsWithIssues,
  syncAdminFacetFromHash,
  toFormLevelIssueMessages,
  toIssueMessage,
  updateFormData,
  updateUserRoleSelection,
} from '#lib/client/services/form.js'
import { getNameForToast } from '#lib/client/services/resource.js'
import {
  getOrganisationSubmitUpdates,
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
import PublishChildrenDialog from '#lib/bits/patterns/resource/PublishChildrenDialog.svelte'
import FormSurface from '#lib/bits/patterns/forms/formSurface/FormSurface.svelte'
import ContentLocaleDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/ContentLocaleDefaults.svelte'
import MultilingualDefaults from '#lib/bits/patterns/forms/contentLocaleDefaults/MultilingualDefaults.svelte'
import type { MultilingualSettingKey } from '#lib/content-locales/settings.js'
// CONTENT LOCALES
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import {
  readContentLocaleForm,
  contentLocaleFormIssues,
} from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleForm.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import { resolveContentLocales } from '#lib/content-locales/resolve.js'
// BITS COMPONENTS
import { formSectionDividerStyles } from '#lib/bits/patterns/forms/formSurface/formSurface.styles.js'
import Skeleton from '#lib/bits/custom/skeleton/Skeleton.svelte'
import {
  FormSectionSkeleton,
  FormProfileSkeleton,
} from '#lib/bits/patterns/forms/formSkeleton/index.js'
import {
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
import LanguagesIcon from 'virtual:icons/lucide/languages'
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
import type {
  Property,
  PropertyTranslationOrigin,
} from '#lib/db/zod/schema/property.types.js'

import type {
  OrganisationBooleanField,
  OrganisationDB,
  OrganisationGetState,
  OrganisationRoleUser,
} from '#lib/db/zod/schema/organisation.types.js'

import type {
  CapabilityFormFields,
  CapabilitySearchOption,
} from '#lib/bits/patterns/capabilities/organisationCapabilities/index.js'

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
  const cached = adminCtx.view.getResourceByRefSync(
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
const isMessagingFacet = $derived(activeFacet === 'messaging')
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

const organisationUsersEnabled = $derived(
  optimisticOrganisationData?.userPolicy?.enabled ?? false,
)

// § Form

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
          meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
        }),
        listQuery: getOrganisations({
          conditions: adminCtx.view.isSuperAdmin() ? {} : { isArchived: false },
          prisms: adminCtx.view.scope.prisms,
          meta: { ...adminCtx.view.resources.queryMeta, profile: 'card' },
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
// Shared authoring defaults remain distinct from the descriptor form's UI locales.
const localeOptions = $derived(contentLocaleOptions(getLocaleKey()))
const localeSettingsPatch = $derived(
  readContentLocaleForm(formCtx.form.fields.value().data?.settings),
)
const inheritedContentLocales = $derived(
  resolveContentLocales({ userLocale: getLocaleKey() }),
)

/**
 * Stage an explicit default order or reset marker in the existing remote form.
 * @param locales Ordered tags, or undefined to remove the stored override.
 * @returns Nothing; the normal form save owns persistence and authorization.
 */
function setContentLocales(locales: string[] | undefined): void {
  updateFormData(
    formCtx.form as unknown as FormDataUpdaterForm<OrganisationEditorFormInput['data']>,
    data => {
      data.settings = {
        ...localeSettingsPatch,
        contentLocales: locales ? normalizeContentLocales(locales) : null,
      }
      return data
    },
  )
  revalidateAfterProgrammaticChange()
}

/** Stage independent multilingual defaults through the existing authorized settings form.
 * @param patch Explicit boolean overrides or null reset markers. @returns Nothing.
 */
function setMultilingualDefaults(
  patch: Partial<Record<MultilingualSettingKey, boolean | null>>,
): void {
  updateFormData(
    formCtx.form as unknown as FormDataUpdaterForm<OrganisationEditorFormInput['data']>,
    data => {
      data.settings = { ...localeSettingsPatch, ...patch }
      return data
    },
  )
  revalidateAfterProgrammaticChange()
}

/** Register JSON settings without copying the resolved user default.
 * @returns Hidden field attributes for the existing settings transport.
 */
function getHiddenLocaleSettingsAttrs(): Record<string, unknown> {
  const { as } = formCtx.form.fields.data.settings as unknown as {
    as(type: 'hidden', value: string): Record<string, unknown>
  }
  return as('hidden', JSON.stringify(localeSettingsPatch))
}
// User settings share the committed form baseline, dirty tracking, cancel and submission.
const userPolicy = $derived.by((): OrganisationUserPolicy => {
  const value = formCtx.form.fields.value().data?.userPolicy
  const parsed = OrganisationUserPolicyFormSchema.safeParse(value)
  return parsed.success && parsed.data
    ? parsed.data
    : { ...DEFAULT_ORGANISATION_USER_POLICY }
})
const organisationHubDomain = $derived(
  optimisticOrganisationData?.hub?.domain?.trim().toLowerCase() ?? null,
)

/** Stage Users settings in the organisation form.
 * @param patch Changed enrolment choices. @returns Nothing; the main Save owns persistence.
 */
function setUserPolicy(patch: Partial<OrganisationUserPolicy>): void {
  updateFormData(
    formCtx.form as unknown as FormDataUpdaterForm<OrganisationEditorFormInput['data']>,
    data => {
      data.userPolicy = { ...userPolicy, ...patch }
      return data
    },
  )
  revalidateAfterProgrammaticChange()
}

/** Register Users settings with the main form transport.
 * @returns Hidden field attributes containing the current staged policy.
 */
function getHiddenUserPolicyAttrs(): Record<string, unknown> {
  const { as } = formCtx.form.fields.data.userPolicy as unknown as {
    as(type: 'hidden', value: string): Record<string, unknown>
  }
  return as('hidden', JSON.stringify(userPolicy))
}
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
    | 'dateResolution'
    | 'timeMaxHour'
    | 'dataType'
    | 'cardinality'
    | 'presentation'
    | 'audience'
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

/** Translate missing property content within an optional field or option scope.
 * @param propertyId Definition being edited.
 * @param sourceLocale Source content language.
 * @param targetLocale Target content language.
 * @param origin Optional text field or stable option identity.
 * @returns Whether translations were applied to the form.
 * @remarks Revalidates after successful translation while preserving unrelated cells.
 */
const onTranslatePropertyLocale = async (
  propertyId: Id,
  sourceLocale: string,
  targetLocale: string,
  origin?: PropertyTranslationOrigin,
): Promise<boolean> => {
  const translated = await translateProjectPropertyLocale(
    organisationPropertyFormAdapter,
    propertyId,
    sourceLocale,
    targetLocale,
    origin,
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
    defaultLocationVisibility?: 'shared' | 'exclusive'
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
const currentUser = $derived(adminCtx.view.account.user)

const currentHub = $derived(adminCtx.view.hub)
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
const canManageMessaging = $derived(
  Boolean(
    optimisticOrganisationData &&
      currentUser &&
      canManageOrganisationMessaging(
        {
          ...currentUser,
          roles: currentUser.roles ?? [],
        },
        optimisticOrganisationData,
      ),
  ),
)
const resolvedFacetTabs = $derived.by(() => {
  if (isNewOrganisationRef) {
    return getAdminFacetTabsForResource(FirstClassResource.organisation, {
      coreOnly: true,
    })
  }

  const tabs = new Map(facetTabs)
  if (!canEditOrganisation) tabs.delete('capabilities')
  if (!canManageMessaging) tabs.delete('messaging')
  if (!canEditOrganisation || !organisationUsersEnabled) tabs.delete('users')

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
  // Users availability follows the committed organisation; retry its deep link after loading.
  if (currentHash === '#users' && !organisationFacetOrder.includes('users')) return
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
  Boolean(formCtx.form?.fields && (isNewOrganisationRef || isCurrentRefLoaded)),
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
    meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
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

/**
 * Persists a resource state change and reconciles affected cached descendants.
 * @param options - State action, feedback, busy handler and explicit child publication choice.
 * @returns Completion of the mutation and cache reconciliation.
 */
async function handleOrganisationStateToggle({
  field,
  successWhenTrue,
  successWhenFalse,
  setBusy,
  mutate,
  publishChildren = false,
}: {
  publishChildren?: boolean
  field: OrganisationBooleanField
  successWhenTrue: string
  successWhenFalse: string
  setBusy: (value: boolean) => void
  mutate: typeof publishOrganisation | typeof archiveOrganisation
}): Promise<void> {
  const previousOrganisation = organisation
  const organisationData = previousOrganisation?.data

  if (!organisationData) return

  const mutationRef = organisationRef
  const mutationScope = adminCtx.view.resources.scopeKey
  const mutationCache = adminCtx.view.cacheCtx
  const mutationGeneration = mutationCache.generation
  let committed = false
  const ownsRoute = editorCtrl.captureRoute()
  const isCurrentMutation = (): boolean =>
    ownsRoute() &&
    organisationRef === mutationRef &&
    adminCtx.view.resources.scopeKey === mutationScope
  const nextState = !organisationData[field]

  setBusy(true)

  const mutation = adminCtx.view.cacheCtx.beginMutation('organisation', {
    meta: { id: organisationData.id },
    data: { [field]: nextState },
  })
  try {
    const result = await mutate({
      id: organisationData.id,
      state: nextState,
      ...(field === 'isPublished' ? { publishChildren } : {}),
      meta: { isAdminRequest: true },
    }).updates(
      // The cache owns optimistic overrides; these handles only request refreshes.
      ...mutation.updates,
      getOrganisation({
        ref: mutationRef,
        refKey: 'code',
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'admin' },
      }),
      // Request the affected list alongside the acknowledged write.
      getOrganisations({
        conditions: adminCtx.view.isSuperAdmin() ? {} : { isArchived: false },
        prisms: adminCtx.view.scope.prisms,
        meta: { ...adminCtx.view.resources.queryMeta, profile: 'card' },
      }),
    )
    committed = true
    mutation.settle(true)
    if (!isCurrentMutation()) return
    // Settle from the acknowledgement; an empty filtered read must not erase the editor.
    if (
      organisationRef === mutationRef &&
      adminCtx.view.resources.scopeKey === mutationScope
    ) {
      const settledOrganisation =
        organisation?.data?.id === organisationData.id
          ? organisation
          : previousOrganisation
      commitSettledOrganisationState({
        ...settledOrganisation,
        data: { ...settledOrganisation?.data, ...result.data },
      } as OrganisationGetState)
    }
    toast.success(
      `${nextState ? successWhenTrue : successWhenFalse} ${getNameForToast(previousOrganisation, 'nameShort')}`,
    )
  } catch {
    mutation.settle(false)
    if (!isCurrentMutation()) return
    toast.error(m.long_crazy_peacock_care())
    return
  } finally {
    if (isCurrentMutation()) setBusy(false)
    // Navigation does not cancel cache invalidation; account resets already discard the old generation.
    if (committed && mutationCache.generation === mutationGeneration) {
      try {
        await mutationCache.reconcile('organisation')
      } catch (error) {
        console.warn(
          'Organisation state saved, but dependent lists could not refresh',
          error,
        )
        if (isCurrentMutation())
          toast.warning(
            'Saved, but some views could not refresh. Please refresh the page.',
          )
      }
    }
  }
}

let pendingPreviewId = $state<string | null>(null)
const canPreview = $derived.by(() => {
  if (!currentUser) return false
  return (
    isCurrentRefLoaded &&
    !optimisticOrganisationData?.isPublished &&
    !organisation?.data?.isArchived &&
    canPreviewPublication(currentUser, currentUser.roles ?? [], {
      organisationId: organisation?.data?.id ?? '',
      projectId: null,
      hubId: organisation?.data?.hubId,
    })
  )
})

/**
 * Opens the same descendant choice as publishing, then starts an isolated map preview.
 * @param publishChildren Explicit descendant choice, or undefined to open the dialog.
 * @returns Nothing; navigation creates a fresh map context without changing publication state.
 */
function onPreview(publishChildren?: boolean): void {
  if (!canPreview || !organisation?.data?.id) return
  if (publishChildren === undefined) {
    pendingPreviewId = organisation.data.id
    return
  }
  if (pendingPreviewId !== organisation.data.id) return
  window.location.assign(
    publicationPreviewUrl({
      type: 'organisation',
      id: organisation.data.id,
      publishChildren,
    }),
  )
}

let pendingPublishId = $state<string | null>(null)

// Dismiss pending publication when navigation changes the target resource.
$effect(() => {
  organisationRef
  pendingPublishId = null
  pendingPreviewId = null
})

/** Prompts before publishing drafts below this resource; unpublishing remains immediate.
 * @param publishChildren - Explicit choice, or undefined to open the prompt.
 * @returns Completion of the selected publication action.
 */
async function onPublishToggle(publishChildren?: boolean): Promise<void> {
  if (
    !isCurrentRefLoaded ||
    !canPublishOrganisation ||
    headerCtrl.state.formActions?.isPublishing
  )
    return
  // A delayed dialog choice must never turn into an unpublish after a remote refresh.
  if (publishChildren !== undefined && organisation?.data?.isPublished) {
    pendingPublishId = null
    return
  }
  if (!organisation?.data?.isPublished && publishChildren === undefined) {
    pendingPublishId = organisation?.data?.id ?? null
    return
  }
  pendingPublishId = null
  await handleOrganisationStateToggle({
    field: 'isPublished',
    successWhenTrue: m.published(),
    successWhenFalse: m.forms__unpublished(),
    setBusy: value => headerCtrl.setPublishing(value),
    mutate: publishOrganisation,
    publishChildren,
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

let profileResetVersion = $state(0)

function onReset(): void {
  profileResetVersion += 1
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
  adminCtx.view.resources.scopeKey
  return untrack(() =>
    editorCtrl.syncRouteAndLoad({
      ref,
      resetFormActionsSignature: () => {
        headerCtrl.setFormActions({ isPublishing: false, isDeleting: false })
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
    }),
  )
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
        .map(
          ([facet, config]) =>
            `${facet}:${typeof config !== 'string' && config.hasIssues ? '1' : '0'}`,
        )
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
    preview: canPreview ? () => onPreview() : null,
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

<Main.Root
  onDimensionsChange={(width, height) =>
    adminCtx.view.layout.setMainDimensions(width, height)}
>
  <Main.Form
    bind:formEl={contentsElement}
    attrs={formCtx.attributes}
    isReady={isFormReady}
  >
    {#snippet fallback()}
      <Main.Facet isVisible={!isImagesFacet} class="right-0! left-0!" fillHeight={true}>
        {#if hasProfileLoadFailed}
          <FormSurface>
            <div role="alert" class="p-6">
              <p class="text-muted-foreground text-sm">
                {m.admin__forms_profile_load_failed()}
              </p>
              <button
                type="button"
                class="border-border hover:bg-raised mt-4 rounded-lg border px-4 py-2 text-sm"
                onclick={retryOrganisationLoad}
              >
                {m.retry()}
              </button>
            </div>
          </FormSurface>
        {:else if !isCoreFacet}
          <FormSurface>
            <section aria-label={m.resource_loading()} aria-busy="true">
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
            </section>
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
    <input {...getHiddenUserPolicyAttrs()}>
    <Main.Facet
      isVisible={activeFacet === 'advanced'}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('advanced', 'previous')}
      nextAction={buildFacetNavAction('advanced', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'advanced' }}
    >
      <FormSurface>
        <section class="flex min-h-0 flex-col gap-4 pb-6">
          <SectionHeader title={m.project_advanced()} />
          <div class="mx-6 min-w-0">
            <h2 class="mb-3 flex items-center gap-2 text-base font-semibold">
              <LanguagesIcon class="size-5" aria-hidden="true" />
              {m.content_languages_heading()}
            </h2>
            <div
              class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] gap-4"
            >
              <ContentLocaleDefaults
                organisationName={formCtx.form.fields.value().data?.i18n?.[
                  getLocaleKey()
                ]?.nameShort || getNameForToast(organisation, 'nameShort')}
                {...{ scope: 'organisation' as const }}
                value={localeSettingsPatch.contentLocales ?? undefined}
                inheritedLocales={inheritedContentLocales.locales}
                inheritedOrigin="user-default"
                options={localeOptions}
                disabled={!isEditing || formCtx.submitting}
                onChange={setContentLocales}
                issues={contentLocaleFormIssues(visibleAllIssues)}
              />
              <MultilingualDefaults
                {...{ scope: 'organisation' as const }}
                value={localeSettingsPatch}
                disabled={!isEditing || formCtx.submitting}
                onChange={setMultilingualDefaults}
              />
            </div>
            <input {...getHiddenLocaleSettingsAttrs()}>
          </div>
          <h2 class="mx-6 mt-2 text-base font-semibold">
            {m.content_visibility_heading()}
          </h2>
          <div
            class="border-border bg-foreground/4 mx-6 flex min-h-14 items-center justify-between rounded-lg border px-5 py-3"
          >
            <span class="text-sm font-semibold"
              >{m.organisation_location_visibility_default()}</span
            >
            <LocationVisibilitySelect
              value={formCtx.form.fields.value().data?.defaultLocationVisibility ??
                'shared'}
              disabled={!isEditing || formCtx.submitting}
              onChange={value =>
                updateFormData(capabilityFormUpdater, data => {
                  data.defaultLocationVisibility = value
                  return data
                })}
            />
            <input
              {...formCtx.form.fields.data.defaultLocationVisibility.as(
                'hidden',
                formCtx.form.fields.value().data?.defaultLocationVisibility ?? 'shared',
              )}
            >
          </div>
        </section>
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      isVisible={isCoreFacet}
      transition="fade"
      fillHeight={true}
      previousAction={buildFacetNavAction('core', 'previous')}
      nextAction={buildFacetNavAction('core', 'next')}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'core' }}
    >
      <FormSurface>
        <SectionHeader title="Profile">
          {#snippet left()}
            <div class="flex items-center gap-3">
              <OrganisationIcon class="text-primary size-6" aria-hidden="true" />
              <h2 class="text-xl font-semibold tracking-tight">Profile</h2>
            </div>
          {/snippet}
          {#snippet center()}
            <SectionHeaderPrimitive.Issues issues={formLevelIssues} />
          {/snippet}
        </SectionHeader>
        <div class="pt-6">
          <FormI18nDescriptorProfile
            form={formCtx.form}
            fields={formCtx.form.fields.data.i18n}
            defaultLocales={locales}
            recordKey={organisationRef}
            resetVersion={profileResetVersion}
            {isEditing}
            {isRequiredInPreflight}
            translate={(source, target, text) =>
              translateContentField({ source, target, text })}
            onChange={revalidateAfterProgrammaticChange}
          />
        </div>

        {@const roleFieldNameByUserId = getRoleFieldNameByUserId(userRoleResolverForm)}
        <div class={formSectionDividerStyles}>
          <FormUserRolesSection
            currentUserId={currentActor.userId}
            icon={OrganisationIcon}
            layout="list"
            title="Staff"
            subtitle="Owners and members manage this organisation."
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
      class="right-0! left-0!"
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
          emptyCapabilitiesInputAttrs={(
            formCtx.form.fields.data.capabilities as unknown as {
              as(type: 'hidden', value: string): Record<string, unknown>
            }
          ).as('hidden', '{}')}
          {shouldSubmitEmptyCapabilities}
          {capabilityIssues}
          {isRequiredInPreflight}
          {getCapabilityDisplayLabel}
          {onAddCapability}
          {onRemoveCapability}
          onTranslate={onTranslateCapabilities}
          onResetLocale={onResetCapabilityLocale}
          onEnterEditMode={() => headerCtrl.setEditing(true)}
        >
          {#snippet users()}
            {#if optimisticOrganisationData?.id}
              <OrganisationUserSettings
                policy={userPolicy}
                hubId={optimisticOrganisationData.hubId ?? null}
                hubDomain={organisationHubDomain}
                disabled={!isEditing || formCtx.submitting}
                onChange={setUserPolicy}
              />
            {/if}
          {/snippet}
        </OrganisationCapabilities>
      </FormSurface>
    </Main.Facet>
    <Main.Facet
      isVisible={activeFacet === 'users' &&
        canEditOrganisation &&
        organisationUsersEnabled}
      fillHeight={true}
      class="right-0! left-0!"
      attrs={{ 'data-facet-id': 'users' }}
    >
      {#if activeFacet === 'users' &&
        canEditOrganisation &&
        organisationUsersEnabled &&
        optimisticOrganisationData?.id}
        {#key optimisticOrganisationData.id}
          <OrganisationUsers organisationId={optimisticOrganisationData.id} />
        {/key}
      {/if}
    </Main.Facet>
    <Main.Facet
      isVisible={isFieldsFacet}
      transition="fade"
      fillHeight={true}
      class="bits-theme right-0! left-0! min-h-0"
      previousAction={buildFacetNavAction('fields', 'previous')}
      nextAction={buildFacetNavAction('fields', 'next')}
      attrs={{ 'data-facet-id': 'fields' }}
    >
      <FormSurface class={`${resourceTabsStyles} flex min-h-0 flex-1 flex-col`}>
        <!-- Reserve usable scroll space below the final option row and fixed facet actions. -->
        <FormFieldsSection
          class="shrink-0 pb-[320px]"
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
    isVisible={isMessagingFacet && canManageMessaging}
    transition="fade"
    attrs={{ 'data-facet-id': 'messaging' }}
  >
    {#if isMessagingFacet && canManageMessaging && optimisticOrganisationData}
      {#key optimisticOrganisationData.id}
        <OrganisationMessaging organisationId={optimisticOrganisationData.id} />
      {/key}
    {/if}
  </Main.Facet>
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
          <section
            aria-label={m.resource_loading()}
            aria-busy="true"
            class="h-full p-6"
          >
            <Skeleton class="h-full min-h-64 w-full rounded-xl" />
          </section>
        {:else if hasProfileLoadFailed}
          <div role="alert" class="text-muted-foreground p-6 text-sm">
            <p>{m.admin__forms_profile_load_failed()}</p>
            <button
              type="button"
              class="border-border hover:bg-raised mt-4 rounded-lg border px-4 py-2"
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
            class="text-base-content/65 flex h-full w-full items-center justify-center p-6 text-center text-sm"
          >
            {m.admin__forms_organisation_image_save_hint()}
          </div>
        {/if}
      </div>
    </FormSurface>
  </Main.Facet>
</Main.Root>

{#if pendingPublishId && pendingPublishId === organisation?.data?.id}
  <PublishChildrenDialog
    resourceType="organisation"
    onChoice={choice => onPublishToggle(choice)}
    onCancel={() => {
      pendingPublishId = null
    }}
  />
{/if}

{#if pendingPreviewId && pendingPreviewId === organisation?.data?.id}
  <PublishChildrenDialog
    resourceType="organisation"
    mode="preview"
    onChoice={choice => onPreview(choice)}
    onCancel={() => {
      pendingPreviewId = null
    }}
  />
{/if}
