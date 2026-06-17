// I18N
import { toLocaleKebab, toLocaleKey } from '$lib/i18n'
import { toFormLocaleRecord } from '$lib/i18n'
// ENUMS
import { HubSubscriptionService } from '$lib/enums'
// SERVICES
import {
  createDefaultHubPrivacyPolicy,
  createDefaultHubTermsOfService,
} from '$lib/services/policy'
// SERVICES
import {
  overrideResourceEntityBoolean,
  overrideResourceListItemBoolean,
} from '$lib/client/services/resource'
// TYPES
import type {
  HubOrganisationFieldNameResolverForm,
  HubOrganisationHiddenInputAttrs,
  HubLayerDefaultFieldNameResolverForm,
  HubLayerDefaultHiddenInputAttrs,
  Locale,
} from '$lib/types'
import type {
  Hub,
  HubBooleanField,
  HubFormInput,
  HubIdentityPatch,
} from '$lib/db/zod/schema/hub.types'

type HubFormLocale = HubFormInput['data']['i18n']['en']
type HubFormRootForDefaults = {
  legalContactAddress?: string | null | undefined
}

function normalizeHubSubscriptionService(
  subscriptionService: Hub['subscriptionService'] | null | undefined,
): NonNullable<HubFormInput['data']['subscriptionService']> {
  return subscriptionService === HubSubscriptionService.substack
    ? HubSubscriptionService.substack
    : HubSubscriptionService.substack
}

function normalizeHubFormLocale(
  root: HubFormRootForDefaults | null | undefined,
  locale: Partial<HubFormLocale> | null | undefined,
  localeKey: 'en' | 'zhHans' | 'zhHant',
): HubFormLocale {
  return {
    name: locale?.name ?? '',
    nameShort: locale?.nameShort ?? '',
    description: locale?.description ?? '',
    subscriptionBenefits: locale?.subscriptionBenefits ?? '',
    nameGen: locale?.nameGen ?? false,
    nameShortGen: locale?.nameShortGen ?? false,
    descriptionGen: locale?.descriptionGen ?? false,
    subscriptionBenefitsGen: locale?.subscriptionBenefitsGen ?? false,
    privacyPolicy:
      locale?.privacyPolicy ??
      createDefaultHubPrivacyPolicy(
        localeKey,
        locale?.name,
        locale?.nameShort,
        root?.legalContactAddress,
      ),
    privacyPolicyGen: locale?.privacyPolicyGen ?? false,
    termsOfService:
      locale?.termsOfService ??
      createDefaultHubTermsOfService(
        localeKey,
        locale?.name,
        locale?.nameShort,
        root?.legalContactAddress,
      ),
    termsOfServiceGen: locale?.termsOfServiceGen ?? false,
  }
}

function cloneHubProperties(
  properties: Hub['properties'] | null | undefined,
): HubFormInput['data']['properties'] {
  if (!properties) return []
  return properties.map(property => ({
    ...property,
    i18n: toFormLocaleRecord(property.i18n) as typeof property.i18n,
    values: Array.isArray(property.values)
      ? property.values.map(value => ({
          ...value,
          i18n: toFormLocaleRecord(value.i18n) as typeof value.i18n,
        }))
      : property.values,
  })) as HubFormInput['data']['properties']
}

export function toHubFormInput(data?: Hub | null): HubFormInput {
  if (!data) {
    const defaultData = {
      code: '',
      domain: '',
      legalContactAddress: '',
      isSubscriptionAvailable: false,
      subscriptionService: HubSubscriptionService.substack,
      subscriptionId: '',
      subscriptionSessionCookie: '',
      subscriptionPlacement: {
        hubPanel: false,
        topBar: false,
        menu: true,
      },
    } satisfies Pick<
      HubFormInput['data'],
      | 'code'
      | 'domain'
      | 'legalContactAddress'
      | 'isSubscriptionAvailable'
      | 'subscriptionService'
      | 'subscriptionId'
      | 'subscriptionSessionCookie'
      | 'subscriptionPlacement'
    >

    return {
      meta: { mode: 'create', isAdminRequest: true },
      data: {
        ...defaultData,
        i18n: {
          en: normalizeHubFormLocale(defaultData, undefined, 'en'),
          zhHans: normalizeHubFormLocale(defaultData, undefined, 'zhHans'),
          zhHant: normalizeHubFormLocale(defaultData, undefined, 'zhHant'),
        },
        userRoles: [],
        organisations: [],
        layerDefaults: [],
        properties: [],
      },
    }
  }

  const normalizedData = {
    code: data.code,
    domain: data.domain ?? '',
    legalContactAddress: data.legalContactAddress ?? '',
    isSubscriptionAvailable: Boolean(data.isSubscriptionAvailable),
    subscriptionService: normalizeHubSubscriptionService(data.subscriptionService),
    subscriptionId: data.subscriptionId ?? '',
    subscriptionSessionCookie: data.subscriptionSessionCookie ?? '',
    subscriptionPlacement: {
      hubPanel: Boolean(data.subscriptionPlacement?.hubPanel),
      topBar: Boolean(data.subscriptionPlacement?.topBar),
      menu:
        typeof data.subscriptionPlacement?.menu === 'boolean'
          ? data.subscriptionPlacement.menu
          : true,
    },
  } satisfies Pick<
    HubFormInput['data'],
    | 'code'
    | 'domain'
    | 'legalContactAddress'
    | 'isSubscriptionAvailable'
    | 'subscriptionService'
    | 'subscriptionId'
    | 'subscriptionSessionCookie'
    | 'subscriptionPlacement'
  >

  return {
    meta: {
      id: data.id,
      updatedAt: data.modifiedAt,
      mode: 'update',
      isAdminRequest: true,
    },
    data: {
      ...normalizedData,
      i18n: {
        en: normalizeHubFormLocale(normalizedData, data.i18n?.en, 'en'),
        zhHans: normalizeHubFormLocale(normalizedData, data.i18n?.zhHans, 'zhHans'),
        zhHant: normalizeHubFormLocale(normalizedData, data.i18n?.zhHant, 'zhHant'),
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
      layerDefaults: (data.layerDefaults ?? []).map(layerDefault => ({
        hubId: layerDefault.hubId,
        layerId: layerDefault.layerId,
        isDefaultVisible: Boolean(layerDefault.isDefaultVisible),
      })),
      properties: cloneHubProperties(data.properties),
    },
  }
}

export function overrideHubEntityBoolean(field: HubBooleanField, value: boolean) {
  return overrideResourceEntityBoolean(field, value)
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

export function getHubLayerDefaultHiddenInputAttrs(
  form: HubLayerDefaultFieldNameResolverForm,
  layerDefaults: Array<{
    hubId: string
    layerId: string
    isDefaultVisible: boolean
  }>,
): HubLayerDefaultHiddenInputAttrs[] {
  const layerDefaultFields = form.fields.data?.layerDefaults ?? []

  return layerDefaults
    .flatMap((layerDefault, index) => {
      const row = layerDefaultFields[index]
      if (!row) return []

      return [
        row.hubId?.as('hidden', layerDefault.hubId),
        row.layerId?.as('hidden', layerDefault.layerId),
        row.isDefaultVisible?.as(
          'hidden',
          layerDefault.isDefaultVisible ? 'true' : 'false',
        ),
      ]
    })
    .filter((attrs): attrs is HubLayerDefaultHiddenInputAttrs => Boolean(attrs))
}

export function overrideHubListItemBoolean(
  hubId: string,
  field: HubBooleanField,
  value: boolean,
) {
  return overrideResourceListItemBoolean(hubId, field, value)
}

export function toHubIdentityPatch(
  formData: HubFormInput,
  locale: Locale,
): HubIdentityPatch {
  const localeKey = toLocaleKey(locale)
  const entityLocale = toLocaleKebab(localeKey)
  const localeData = formData.data?.i18n?.[localeKey]

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
