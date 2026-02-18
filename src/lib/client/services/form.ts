import { toast } from 'svelte-sonner'
import { getLocale, toOrganisationFormLocaleKey, translateI18nFields } from '$lib/i18n'
import { m } from '$lib/i18n'
import type {
  AddUserRoleSelectionParams,
  GenAiField,
  GenAiStateResolverForm,
  HeaderFormActionStatus,
  FormDataUpdaterForm,
  FormSubmissionResultHandlerParams,
  I18nTranslatableField,
  RemoveUserRoleSelectionParams,
  ResetLocaleFieldsParams,
  ResourceFormSubmissionResultParams,
  SyncHeaderFormActionStatusParams,
  TranslateLocaleIntoEmptyFieldsParams,
  UpdateUserRoleSelectionParams,
  UserRoleFieldNameResolverForm,
  WireHeaderFormActionHandlersParams,
  Locale,
} from '$lib/types'

export async function handleSubmissionResult({
  success,
  issues,
  error,
  onSuccess,
  onError,
  onInvalid,
  onFallback,
}: FormSubmissionResultHandlerParams): Promise<void> {
  if (success) {
    await onSuccess()
    return
  }

  if (error) {
    await onError(error)
    return
  }

  if ((issues?.length ?? 0) > 0) {
    await onInvalid(issues ?? [])
    return
  }

  await onFallback()
}

export async function handleResourceFormSubmissionResult({
  success,
  issues,
  error,
  nameKey,
  nameFallbackKey,
  headerCtrl,
  refreshResource,
  entity,
  resourceValues,
  invalidMessage = m.forms__invalid(),
  fallbackErrorMessage = m.long_crazy_peacock_care(),
  successPrefix = m.tidy_game_jellyfish_pop(),
}: ResourceFormSubmissionResultParams): Promise<void> {
  const asTrimmedString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : ''

  const entityData =
    entity && typeof entity === 'object'
      ? ((entity as { data?: Record<string, unknown> | null }).data ?? undefined)
      : undefined
  const resolvedResourceValues = resourceValues ?? entityData ?? undefined

  if (success) {
    const name =
      getNameForToast(entity, nameKey) ||
      asTrimmedString(resolvedResourceValues?.[nameFallbackKey]) ||
      ''
    toast.success(`${successPrefix}${name ? ` ${name}` : ''}`)
    headerCtrl.setEditing(false)
    await refreshResource()
    return
  }

  if (error) {
    toast.error(error)
    return
  }

  if ((issues?.length ?? 0) > 0) {
    toast.error(invalidMessage)
    return
  }

  toast.error(fallbackErrorMessage)
}

export function wireHeaderFormActionHandlers({
  headerCtrl,
  handlers,
}: WireHeaderFormActionHandlersParams): void {
  headerCtrl.setFormActions(handlers)
}

export function toHeaderFormActionStatusSignature(
  status: HeaderFormActionStatus,
): string {
  return `${status.dirty}|${status.isSubmitting}|${status.hasIssues}|${status.isPublished}|${status.isDeleted}|${status.canEdit}|${status.canPublish}`
}

export function syncHeaderFormActionStatus({
  headerCtrl,
  status,
  lastSignature,
}: SyncHeaderFormActionStatusParams): string {
  const signature = toHeaderFormActionStatusSignature(status)
  if (signature === lastSignature) return lastSignature
  headerCtrl.setFormActions(status)
  return signature
}

export function getNameForToast(
  entity: { data?: Record<string, unknown> | null } | null | undefined,
  key: string = 'shortName',
): string {
  const asTrimmedString = (value: unknown): string => {
    if (typeof value !== 'string') return ''
    return value.trim()
  }

  const data =
    entity && typeof entity === 'object'
      ? ((entity as { data?: Record<string, unknown> | null }).data ?? undefined)
      : undefined
  if (!data) return ''

  const locale = getLocale()
  const i18n =
    data && typeof data === 'object'
      ? ((data as Record<string, unknown>).i18n as
          | Record<string, Record<string, unknown>>
          | undefined)
      : undefined

  const byLocale = asTrimmedString(i18n?.[locale]?.[key])
  if (byLocale) return byLocale

  const byRoot = asTrimmedString((data as Record<string, unknown>)[key])
  if (byRoot) return byRoot

  return asTrimmedString((data as Record<string, unknown>).code)
}

export function getRoleFieldNameByUserId(
  form: UserRoleFieldNameResolverForm,
): Record<string, string> {
  const userRoles = form.fields.value().data?.userRoles ?? []
  const roleFields = form.fields.data.userRoles

  return Object.fromEntries(
    userRoles.map((userRole, index) => [
      userRole.userId,
      roleFields[index]?.role.as('select').name ?? '',
    ]),
  )
}

/* ----------------- */
// GEN-AI HELPERS
/* -------- */

export function getGenAiState(
  form: GenAiStateResolverForm,
  locale: Locale,
  field: GenAiField,
): boolean {
  const formLocale = toOrganisationFormLocaleKey(locale)
  const localeData = form.fields.value().data?.i18n?.[formLocale]
  if (!localeData) return false
  if (field === 'name') return Boolean(localeData.nameGen)
  if (field === 'nameShort') return Boolean(localeData.nameShortGen)
  return Boolean(localeData.descriptionGen)
}

export function toggleGenAiField<
  T extends {
    i18n?: Record<
      string,
      {
        nameGen?: boolean
        nameShortGen?: boolean
        descriptionGen?: boolean
      }
    >
  },
>(form: FormDataUpdaterForm<T>, locale: Locale, field: GenAiField): void {
  updateFormData(form, data => {
    const formLocaleKey = toOrganisationFormLocaleKey(locale)
    if (!data.i18n?.[formLocaleKey]) return data
    const fieldName = `${field}Gen` as 'nameGen' | 'nameShortGen' | 'descriptionGen'
    const nextValue = !data.i18n[formLocaleKey][fieldName]
    data.i18n[formLocaleKey][fieldName] = nextValue
    return data
  })
}

/* ----------------- */
// I18N HELPERS
/* -------- */

const DEFAULT_TRANSLATABLE_FIELDS: I18nTranslatableField[] = [
  'name',
  'nameShort',
  'description',
]

const toGenField = (field: I18nTranslatableField): `${I18nTranslatableField}Gen` =>
  `${field}Gen`

export async function translateLocaleIntoEmptyFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: boolean
        nameShortGen?: boolean
        descriptionGen?: boolean
      }
    >
  },
>({
  form,
  sourceLocale,
  targetLocale,
  fields = DEFAULT_TRANSLATABLE_FIELDS,
}: TranslateLocaleIntoEmptyFieldsParams<TFormData>): Promise<void> {
  const currentFormData = form.fields.value().data
  if (!currentFormData?.i18n) return

  const localeKeyMap: Record<Locale, string> = {
    en: 'en',
    'zh-hans': 'zhHans',
    'zh-hant': 'zhHant',
  }

  const i18n = {
    en: Object.fromEntries(
      fields.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap.en]?.[field] ?? '',
      ]),
    ),
    'zh-hans': Object.fromEntries(
      fields.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap['zh-hans']]?.[field] ?? '',
      ]),
    ),
    'zh-hant': Object.fromEntries(
      fields.map(field => [
        field,
        currentFormData.i18n?.[localeKeyMap['zh-hant']]?.[field] ?? '',
      ]),
    ),
  }

  const translated = await translateI18nFields({
    source: sourceLocale,
    target: targetLocale,
    fields,
    i18n,
  })

  updateFormData(form, data => {
    const targetFormLocale = toOrganisationFormLocaleKey(targetLocale)
    const targetLocaleData = data.i18n?.[targetFormLocale]
    if (!targetLocaleData) return data

    for (const field of fields) {
      const currentValue = targetLocaleData[field]
      if (typeof currentValue === 'string' && currentValue.trim().length > 0) continue
      const nextValue = translated[field] ?? ''
      targetLocaleData[field] = nextValue
      if (nextValue.trim().length > 0) {
        targetLocaleData[toGenField(field)] = true
      }
    }
    return data
  })
}

export function resetLocaleFields<
  TFormData extends {
    i18n?: Record<
      string,
      {
        name?: string
        nameShort?: string
        description?: string
        nameGen?: boolean
        nameShortGen?: boolean
        descriptionGen?: boolean
      }
    >
  },
>({
  form,
  targetLocale,
  fields = DEFAULT_TRANSLATABLE_FIELDS,
}: ResetLocaleFieldsParams<TFormData>): void {
  updateFormData(form, data => {
    const targetFormLocale = toOrganisationFormLocaleKey(targetLocale)
    const targetLocaleData = data.i18n?.[targetFormLocale]
    if (!targetLocaleData) return data

    for (const field of fields) {
      targetLocaleData[field] = ''
      targetLocaleData[toGenField(field)] = false
    }
    return data
  })
}

export function updateFormData<T>(
  form: FormDataUpdaterForm<T>,
  updater: (data: T) => T,
): void {
  const current = form.fields.value()
  if (!current.data) return
  let clonedData: T
  try {
    clonedData = structuredClone(current.data)
  } catch {
    // Svelte proxy-backed objects may fail structuredClone.
    clonedData = JSON.parse(JSON.stringify(current.data)) as T
  }
  form.fields.set({
    ...current,
    data: updater(clonedData),
  })
}

/* ----------------- */
// ENTITY HELPERS
/* -------- */

export function toggleEntityDataBoolean<
  TEntity extends { data?: Record<string, unknown> | null } | null,
>(entity: TEntity, key: string, nextChecked: boolean | null): TEntity {
  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      [key]: Boolean(nextChecked),
    },
  } as TEntity
}

export function addUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  user,
  defaultRole,
  foreignKey,
}: AddUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    const existing = data.userRoles ?? []
    if (existing.some(userRole => userRole.userId === user.id)) return data
    data.userRoles = [...existing, { userId: user.id, role: defaultRole }]
    return data
  })

  if (!entity?.data) return entity
  const entityData = entity.data
  const existingEntityRoles =
    (entityData.userRoles as Array<Record<string, unknown>>) ?? []
  if (existingEntityRoles.some(userRole => userRole.userId === user.id)) return entity

  return {
    ...entity,
    data: {
      ...entityData,
      userRoles: [
        ...existingEntityRoles,
        {
          [foreignKey]: entityData.id,
          userId: user.id,
          role: defaultRole,
          user: {
            id: user.id,
            name: user.name,
            image: user.image,
            attribution: user.attribution,
          },
        },
      ],
    },
  } as TEntity
}

export function removeUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  userId,
}: RemoveUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    data.userRoles = (data.userRoles ?? []).filter(
      userRole => userRole.userId !== userId,
    )
    return data
  })

  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      userRoles: (
        (entity.data.userRoles as Array<Record<string, unknown>>) ?? []
      ).filter(userRole => userRole.userId !== userId),
    },
  } as TEntity
}

export function updateUserRoleSelection<
  TEntity extends { data?: Record<string, unknown> | null } | null,
  TFormData extends { userRoles?: Array<{ userId: string; role: string }> },
>({
  form,
  entity,
  userId,
  role,
}: UpdateUserRoleSelectionParams<TEntity, TFormData>): TEntity {
  updateFormData(form, data => {
    data.userRoles = (data.userRoles ?? []).map(userRole =>
      userRole.userId === userId ? { ...userRole, role } : userRole,
    )
    return data
  })

  if (!entity?.data) return entity
  return {
    ...entity,
    data: {
      ...entity.data,
      userRoles: ((entity.data.userRoles as Array<Record<string, unknown>>) ?? []).map(
        userRole => (userRole.userId === userId ? { ...userRole, role } : userRole),
      ),
    },
  } as TEntity
}
