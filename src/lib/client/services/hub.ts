// I18N
import { toLocaleCode, toLocaleKey } from '$lib/i18n'
// TYPES
import type {
  Hub,
  HubBooleanField,
  HubFormInput,
  HubOrganisationFieldNameResolverForm,
  HubOrganisationHiddenInputAttrs,
  Locale,
} from '$lib/types'

function normalizeHubFormLocale(
  locale: Partial<HubFormInput['data']['i18n']['en']> | null | undefined,
): HubFormInput['data']['i18n']['en'] {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
  }
}

export function toHubFormInput(data?: Hub | null): HubFormInput {
  if (!data) {
    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        code: '',
        domain: '',
        i18n: {
          en: normalizeHubFormLocale(undefined),
          zhHans: normalizeHubFormLocale(undefined),
          zhHant: normalizeHubFormLocale(undefined),
        },
        userRoles: [],
        organisations: [],
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
      domain: data.domain ?? '',
      i18n: {
        en: normalizeHubFormLocale(data.i18n?.en),
        zhHans: normalizeHubFormLocale(data.i18n?.zhHans),
        zhHant: normalizeHubFormLocale(data.i18n?.zhHant),
      },
      userRoles: (data.userRoles ?? []).map(userRole => ({
        userId: userRole.userId,
        role: userRole.role,
      })),
      organisations: (data.organisations ?? []).map(organisation => ({
        organisationId: organisation.id,
        isCoreInclusive: Boolean(organisation.isCoreInclusive),
        isHubExclusive: Boolean(organisation.isHubExclusive),
      })),
    },
  }
}

export function overrideHubEntityBoolean(field: HubBooleanField, value: boolean) {
  return <T extends { data: Record<string, unknown> | null }>(current: T): T => ({
    ...current,
    data: current.data ? { ...current.data, [field]: value } : current.data,
  })
}

export function getHubOrganisationHiddenInputAttrs(
  form: HubOrganisationFieldNameResolverForm,
  organisations: Array<{
    organisationId: string
    isCoreInclusive: boolean
    isHubExclusive: boolean
  }>,
): HubOrganisationHiddenInputAttrs[] {
  const organisationFields = form.fields.data?.organisations ?? []

  return organisations
    .flatMap((organisation, index) => {
      const row = organisationFields[index]
      if (!row) return []

      return [
        row.organisationId?.as('hidden', organisation.organisationId),
        row.isCoreInclusive?.as(
          'hidden',
          organisation.isCoreInclusive ? 'true' : 'false',
        ),
        row.isHubExclusive?.as(
          'hidden',
          organisation.isHubExclusive ? 'true' : 'false',
        ),
      ]
    })
    .filter((attrs): attrs is HubOrganisationHiddenInputAttrs => Boolean(attrs))
}

export function overrideHubListItemBoolean(
  hubId: string,
  field: HubBooleanField,
  value: boolean,
) {
  return <T extends { data?: Array<Record<string, unknown>> | null }>(
    current: T,
  ): T => ({
    ...current,
    data: (current.data ?? []).map(item =>
      item.id === hubId ? { ...item, [field]: value } : item,
    ),
  })
}

export function toHubIdentityPatch(
  formData: HubFormInput,
  locale: Locale,
): {
  code: string
  locale: Locale
  name: string
  nameShort: string
} {
  const formLocale = toLocaleKey(locale)
  const entityLocale = toLocaleCode(formLocale)
  const localeData = formData.data?.i18n?.[formLocale]

  return {
    code: formData.data?.code ?? '',
    locale: entityLocale,
    name: localeData?.name ?? '',
    nameShort: localeData?.nameShort ?? '',
  }
}

export function getHubSubmitUpdates<TEntityResult, TListResult>({
  hubId,
  entityQuery,
  listQuery,
}: {
  hubId?: string | null
  entityQuery: TEntityResult
  listQuery: TListResult
}): Array<TEntityResult | TListResult> {
  if (!hubId) return []
  return [entityQuery, listQuery]
}
