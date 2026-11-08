// TABLE OF CONTENTS
// 1. Editor contract
// 2. Remote form and committed baseline
// 3. Settings and enrolment drafts

// CLIENT SERVICES
import { createResourceFormConfig, updateFormData } from '#lib/client/services/form.js'
import {
  getOrganisationSubmitUpdates,
  toOrganisationFormInput,
} from '#lib/client/services/organisation.js'
// REMOTE
import {
  getOrganisation,
  getOrganisations,
  organisationForm,
} from '#lib/api/organisation.remote.js'
// FORM
import { configureForm } from '#lib/factories.svelte.js'
import { OrganisationPreflightFormData } from '#lib/db/zod/schema/organisation.form.js'
// SETTINGS
import { readOrganisationSettingsForm } from '#lib/organisations/settings.js'
import { readChatAppearance } from '#lib/messaging/appearance.js'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
import {
  DEFAULT_ORGANISATION_USER_POLICY,
  OrganisationUserPolicyFormSchema,
} from '#lib/organisation-users/policy.js'
// I18N
import { getLocale } from '#lib/i18n.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { RemoteForm, RemoteFormInput } from '$app/server'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { GenericForm } from '#lib/factories.svelte.js'
import type { getAdminCtx } from '#lib/context/admin.svelte.js'
import type { getHeaderCtrl } from '#lib/context/header.svelte.js'
import type { FormDataUpdaterForm } from '#lib/client/services/form.types.js'
import type { OrganisationGetState } from '#lib/db/zod/schema/organisation.types.js'
import type { OrganisationSettingsPatch } from '#lib/organisations/settings.js'
import type { ChatAppearance } from '#lib/messaging/appearance.js'
import type { MultilingualSettingKey } from '#lib/content-locales/settings.js'
import type { OrganisationUserPolicy } from '#lib/organisation-users/policy.js'

export type OrganisationEditorFormInput = ReturnType<typeof toOrganisationFormInput>
type OrganisationRemoteFormInput = RemoteFormInput & OrganisationEditorFormInput

interface OrganisationEditorOptions {
  adminCtx: ReturnType<typeof getAdminCtx>
  headerCtrl: ReturnType<typeof getHeaderCtrl>
  getRef: () => string
  getFormElement: () => HTMLFormElement | undefined
  getCommitted: () => OrganisationGetState
  getEntity: () => OrganisationGetState
  isEditing: () => boolean
  canSubmit: () => boolean
  refresh: (code?: string) => Promise<OrganisationGetState>
  onRefreshed: (state: OrganisationGetState) => void
  onChange: () => void
}
interface OrganisationEditorModel {
  readonly formCtx: GenericForm<OrganisationRemoteFormInput>
  readonly settings: OrganisationSettingsPatch
  readonly messagingAppearance: ChatAppearance
  readonly userPolicy: OrganisationUserPolicy
  setMessagingAppearance: (appearance: ChatAppearance) => void
  setContentLocales: (locales: string[] | undefined) => void
  setMultilingualDefaults: (
    patch: Partial<Record<MultilingualSettingKey, boolean | null>>,
  ) => void
  setUserPolicy: (patch: Partial<OrganisationUserPolicy>) => void
  getHiddenOrganisationSettingsAttrs: () => Record<string, unknown>
  getHiddenUserPolicyAttrs: () => Record<string, unknown>
}

/** Own the organisation form baseline and drafts across its facet compositions.
 * @param options Live route identity, capabilities and refresh callbacks.
 * @returns Reactive form state and staged mutations sharing Save, cancel and validation.
 * @remarks The route owns navigation and policy; all writes use the existing remote form.
 */
export function useOrganisationEditorModel(
  options: OrganisationEditorOptions,
): OrganisationEditorModel {
  const configuredOrganisationForm = configureForm<OrganisationRemoteFormInput>(() => ({
    form: organisationForm as unknown as RemoteForm<
      OrganisationRemoteFormInput,
      { data: { id: string; modifiedAt: string } }
    >,
    ...createResourceFormConfig<OrganisationRemoteFormInput>({
      formEl: options.getFormElement(),
      key: options.getRef(),
      schema: OrganisationPreflightFormData as unknown as StandardSchemaV1<
        OrganisationRemoteFormInput,
        unknown
      >,
      // Keep form source anchored to the committed entity snapshot so
      // optimistic view-only entity tweaks (e.g. role UI rows) cannot
      // rehydrate stale i18n values back into the live form.
      data: toOrganisationFormInput(
        options.getCommitted()?.data,
      ) as OrganisationRemoteFormInput,
      submitUpdates: async ({ data }) =>
        getOrganisationSubmitUpdates({
          data,
          locale: getLocale(),
          organisationId: options.getEntity()?.data?.id,
          entityQuery: getOrganisation({
            ref: options.getRef(),
            refKey: 'code',
            meta: { ...options.adminCtx.view.resources.queryMeta, profile: 'admin' },
          }),
          listQuery: getOrganisations({
            conditions: options.adminCtx.view.isSuperAdmin()
              ? {}
              : { isArchived: false },
            prisms: options.adminCtx.view.scope.prisms,
            meta: { ...options.adminCtx.view.resources.queryMeta, profile: 'card' },
          }),
        }),
      adminCtx: options.adminCtx,
      headerCtrl: options.headerCtrl,
      resourceType: FirstClassResource.organisation,
      getEntity: () => options.getEntity(),
      refreshResource: async ({ data, shouldRedirect }) => {
        const submittedCode = data.data?.code?.trim() ?? ''
        const refreshed = await options.refresh(
          shouldRedirect ? submittedCode : undefined,
        )

        options.onRefreshed(refreshed)
      },
    }),
  }))

  const formCtx = $derived(configuredOrganisationForm())
  // Shared authoring defaults remain distinct from the descriptor form's UI locales.
  const organisationSettingsPatch = $derived(
    readOrganisationSettingsForm(formCtx.form.fields.value().data?.settings),
  )
  const messagingAppearance = $derived(
    organisationSettingsPatch.messagingAppearance ?? readChatAppearance(undefined),
  )

  /** Stage the background in the organisation form without issuing a separate write.
   * @param appearance Background being previewed in the Messaging facet.
   * @returns Nothing; the main Save, cancel and revision guard own this draft.
   */
  function setMessagingAppearance(appearance: ChatAppearance): void {
    if (!options.isEditing() || formCtx.submitting || !options.canSubmit()) return
    updateFormData(
      formCtx.form as unknown as FormDataUpdaterForm<
        OrganisationEditorFormInput['data']
      >,
      data => {
        data.settings = {
          ...organisationSettingsPatch,
          messagingAppearance: appearance,
        }
        return data
      },
    )
    options.onChange()
  }

  /**
   * Stage an explicit default order or reset marker in the existing remote form.
   * @param locales Ordered tags, or undefined to remove the stored override.
   * @returns Nothing; the normal form save owns persistence and authorization.
   */
  function setContentLocales(locales: string[] | undefined): void {
    updateFormData(
      formCtx.form as unknown as FormDataUpdaterForm<
        OrganisationEditorFormInput['data']
      >,
      data => {
        data.settings = {
          ...organisationSettingsPatch,
          contentLocales: locales ? normalizeContentLocales(locales) : null,
        }
        return data
      },
    )
    options.onChange()
  }

  /** Stage independent multilingual defaults through the existing authorized settings form.
   * @param patch Explicit boolean overrides or null reset markers.
   * @returns Nothing.
   */
  function setMultilingualDefaults(
    patch: Partial<Record<MultilingualSettingKey, boolean | null>>,
  ): void {
    updateFormData(
      formCtx.form as unknown as FormDataUpdaterForm<
        OrganisationEditorFormInput['data']
      >,
      data => {
        data.settings = { ...organisationSettingsPatch, ...patch }
        return data
      },
    )
    options.onChange()
  }

  /** Register shared settings for every facet without copying resolved defaults.
   * @returns Hidden field attributes for the existing settings transport.
   */
  function getHiddenOrganisationSettingsAttrs(): Record<string, unknown> {
    const { as } = formCtx.form.fields.data.settings as unknown as {
      as(type: 'hidden', value: string): Record<string, unknown>
    }
    return as('hidden', JSON.stringify(organisationSettingsPatch))
  }
  // User settings share the committed form baseline, dirty tracking, cancel and submission.
  const userPolicy = $derived.by((): OrganisationUserPolicy => {
    const value = formCtx.form.fields.value().data?.userPolicy
    const parsed = OrganisationUserPolicyFormSchema.safeParse(value)
    return parsed.success && parsed.data
      ? parsed.data
      : { ...DEFAULT_ORGANISATION_USER_POLICY }
  })

  /** Stage Users settings in the organisation form.
   * @param patch Changed enrolment choices.
   * @returns Nothing; the main Save owns persistence.
   */
  function setUserPolicy(patch: Partial<OrganisationUserPolicy>): void {
    updateFormData(
      formCtx.form as unknown as FormDataUpdaterForm<
        OrganisationEditorFormInput['data']
      >,
      data => {
        data.userPolicy = { ...userPolicy, ...patch }
        return data
      },
    )
    options.onChange()
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

  return {
    get formCtx() {
      return formCtx
    },
    get settings() {
      return organisationSettingsPatch
    },
    get messagingAppearance() {
      return messagingAppearance
    },
    get userPolicy() {
      return userPolicy
    },
    setMessagingAppearance,
    setContentLocales,
    setMultilingualDefaults,
    setUserPolicy,
    getHiddenOrganisationSettingsAttrs,
    getHiddenUserPolicyAttrs,
  }
}
