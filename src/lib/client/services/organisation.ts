// ENUMS
import type { OrganisationRoleType } from '$lib/enums'
// TYPES
import type {
  Organisation,
  OrganisationFormInput,
  OrganisationFormLocaleSource,
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

export function toOrganisationFormInput(data: Organisation): OrganisationFormInput {
  return {
    meta: { id: data.id },
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
