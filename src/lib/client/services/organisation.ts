// ENUMS
import type { OrganisationRoleType } from '$lib/enums'
// I18N
import {
  toLocaleFromOrganisationFormLocaleKey,
  toOrganisationFormLocaleKey,
} from '$lib/i18n'
// TYPES
import type {
  Locale,
  OrganisationBooleanField,
  Organisation,
  OrganisationFormInput,
  OrganisationFormLocaleSource,
  OrganisationIdentityPatch,
  OrganisationSubmitUpdatesParams,
} from '$lib/types'

function normalizeOrganisationFormLocale(
  locale: OrganisationFormLocaleSource,
): OrganisationFormInput['data']['i18n']['en'] {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
  }
}

export function toOrganisationFormInput(
  data?: Organisation | null,
): OrganisationFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        code: '',
        url: '',
        i18n: {
          en: normalizeOrganisationFormLocale(undefined),
          zhHans: normalizeOrganisationFormLocale(undefined),
          zhHant: normalizeOrganisationFormLocale(undefined),
        },
        userRoles: [],
      },
    }
  }

  return {
    meta: {
      id: data.id,
      updatedAt: data.modifiedAt,
      mode: 'update',
      isAdminRequest: true,
    },
    data: {
      code: data.code,
      url: data.url ?? '',
      i18n: {
        en: normalizeOrganisationFormLocale(data.i18n?.en),
        zhHans: normalizeOrganisationFormLocale(data.i18n?.['zh-hans']),
        zhHant: normalizeOrganisationFormLocale(data.i18n?.['zh-hant']),
      },
      userRoles: (data.userRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role as OrganisationRoleType,
      })),
    },
  }
}

export function overrideOrganisationEntityBoolean(
  field: OrganisationBooleanField,
  value: boolean,
) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

export function overrideOrganisationListItemBoolean(
  organisationId: string,
  field: OrganisationBooleanField,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === organisationId ? { ...item, [field]: value } : item,
    ),
  })
}

export function toOrganisationIdentityPatch(
  formData: OrganisationFormInput,
  locale: Locale,
): OrganisationIdentityPatch {
  const formLocale = toOrganisationFormLocaleKey(locale)
  const entityLocale = toLocaleFromOrganisationFormLocaleKey(formLocale)
  const localeData = formData.data?.i18n?.[formLocale]

  return {
    code: formData.data?.code ?? '',
    locale: entityLocale,
    name: localeData?.name ?? '',
    nameShort: localeData?.nameShort ?? '',
  }
}

function toOrganisationEntityI18nFromFormInput(
  formData: OrganisationFormInput,
): Record<string, OrganisationFormInput['data']['i18n']['en']> {
  return {
    en: normalizeOrganisationFormLocale(formData.data?.i18n?.en),
    'zh-hans': normalizeOrganisationFormLocale(formData.data?.i18n?.zhHans),
    'zh-hant': normalizeOrganisationFormLocale(formData.data?.i18n?.zhHant),
  }
}

export function overrideOrganisationEntityFromFormInput(
  formData: OrganisationFormInput,
) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data
      ? {
          ...current.data,
          code: formData.data?.code ?? '',
          url: formData.data?.url ?? '',
          i18n: {
            ...((current.data.i18n as Record<string, Record<string, unknown>>) ?? {}),
            ...toOrganisationEntityI18nFromFormInput(formData),
          },
        }
      : current.data,
  })
}

function mergeOrganisationIdentityAtLocale(
  source: Record<string, unknown>,
  patch: OrganisationIdentityPatch,
): Record<string, unknown> {
  return {
    ...source,
    code: patch.code,
    i18n: {
      ...(source.i18n as Record<string, Record<string, unknown>> | undefined),
      [patch.locale]: {
        ...((source.i18n as Record<string, Record<string, unknown>> | undefined)?.[
          patch.locale
        ] ?? {}),
        name: patch.name,
        nameShort: patch.nameShort,
      },
    },
  }
}

export function overrideOrganisationEntityIdentity(patch: OrganisationIdentityPatch) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? mergeOrganisationIdentityAtLocale(current.data, patch) : null,
  })
}

export function overrideOrganisationListItemIdentity(
  organisationId: string,
  patch: OrganisationIdentityPatch,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === organisationId
        ? mergeOrganisationIdentityAtLocale(item, patch)
        : item,
    ),
  })
}

export function getOrganisationSubmitUpdates<
  TEntityCurrent,
  TListCurrent,
  TEntityResult,
  TListResult,
>({
  data,
  locale,
  organisationId,
  entityQuery,
  listQuery,
}: OrganisationSubmitUpdatesParams<
  TEntityCurrent,
  TListCurrent,
  TEntityResult,
  TListResult
>): Array<TEntityResult | TListResult> {
  if (!organisationId) return []

  const patch = toOrganisationIdentityPatch(data, locale)

  return [
    entityQuery.withOverride(
      overrideOrganisationEntityFromFormInput(data) as (
        current: TEntityCurrent,
      ) => TEntityCurrent,
    ),
    listQuery.withOverride(
      overrideOrganisationListItemIdentity(organisationId, patch) as (
        current: TListCurrent,
      ) => TListCurrent,
    ),
  ]
}
