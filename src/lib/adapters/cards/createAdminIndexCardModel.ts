import { goto } from '$app/navigation'
import { m, getI18n, getLocaleKey } from '$lib/i18n'
import { getHashiconUrl, getURLfromImage } from '$lib/client/services/image'
import { getUrlForResource } from '$lib/navigation'
import { FirstClassResource } from '$lib/enums'
import type { AdminCtx } from '$lib/context/admin.svelte'
import type { ImageContextEnvelope } from '$lib/db/zod/schema/image.types'
import type { KeyMap, Resource, Task } from '$lib/types'
import type { IndexCardProps } from '$lib/bits/patterns/cards/indexCard'
import EyeIcon from 'virtual:icons/lucide/eye'
import EyeOffIcon from 'virtual:icons/lucide/eye-off'
import LayersIcon from 'virtual:icons/lucide/layers-3'
import OrganisationIcon from 'virtual:icons/lucide/users-round'
import ProjectIcon from 'virtual:icons/lucide/layout-grid'

type UnknownRecord = Record<string, unknown>

type AdminIndexCardEntity<T extends Exclude<Resource, Task>> = T & {
  image?: unknown
}

type CreateAdminIndexCardModelParams<T extends Exclude<Resource, Task>> = {
  adminCtx: AdminCtx
  entity: AdminIndexCardEntity<T>
  keyMap: KeyMap
  search?: string
  onImageClick?: (entity: T) => void
}

function getNestedValue(obj: unknown, path: string): unknown {
  if (!path) return undefined

  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined
    }

    const nextValue = (current as UnknownRecord)[key]
    if (nextValue === undefined) {
      return undefined
    }

    if (Array.isArray(nextValue) && nextValue.length > 0) {
      return nextValue[0]
    }

    return nextValue
  }, obj)
}

function getI18nObject(
  entity: UnknownRecord,
  localeKey: string,
  keyMap: KeyMap,
  fieldPath?: string,
): UnknownRecord {
  const pathToCheck = fieldPath || keyMap.title

  if (pathToCheck.includes('.i18n.') && !pathToCheck.startsWith('i18n.')) {
    const basePath = pathToCheck.substring(0, pathToCheck.indexOf('.i18n'))
    const baseObject = getNestedValue(entity, basePath) as UnknownRecord | undefined
    return (
      (baseObject?.i18n as Record<string, UnknownRecord> | undefined)?.[localeKey] ?? {}
    )
  }

  return (entity.i18n as Record<string, UnknownRecord> | undefined)?.[localeKey] ?? {}
}

function getIndexCardPropertyValue(
  entity: UnknownRecord,
  keyMap: KeyMap,
  localeKey: string,
  keyPath: string,
  useI18n: boolean = true,
): unknown {
  if (!keyPath) {
    return ''
  }

  if (useI18n && (keyPath.includes('.i18n.') || keyPath.startsWith('i18n.'))) {
    const fieldI18nObject = getI18nObject(entity, localeKey, keyMap, keyPath)
    const propertyName = keyPath.includes('.i18n.')
      ? keyPath.split('.i18n.')[1]
      : keyPath.split('i18n.')[1]

    return propertyName ? fieldI18nObject[propertyName] : ''
  }

  return getNestedValue(entity, keyPath)
}

function toDescriptionPreview(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (trimmed.includes('</p>')) {
    const firstParagraph = trimmed.split('</p>')[0] ?? ''
    const withoutOpenTag = firstParagraph.replace(/<p[^>]*>/i, '')
    const withoutTags = withoutOpenTag.replace(/<[^>]+>/g, '').trim()
    if (withoutTags) return withoutTags
  }

  const withoutTags = trimmed
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!withoutTags) return ''

  const firstSentenceMatch = withoutTags.match(/^.*?[.!?。！？](?:\s|$)/)
  if (firstSentenceMatch?.[0]) return firstSentenceMatch[0].trim()

  return withoutTags
}

function toDescriptionFallback(value: unknown): string {
  return toDescriptionPreview(value) || m.loved_spare_hyena_imagine()
}

export function createAdminIndexCardModel<T extends Exclude<Resource, Task>>(
  params: CreateAdminIndexCardModelParams<T>,
): IndexCardProps {
  const { adminCtx, entity, keyMap, search = '', onImageClick } = params
  const localeKey = getLocaleKey()
  const resourceType = adminCtx.activeResourceType
  const appCtx = adminCtx.appCtx
  const preferences = appCtx.getUserPreferences()

  const rawImage = getNestedValue(entity, keyMap.image)
  const imageEnvelope = rawImage ? (rawImage as ImageContextEnvelope) : null
  const imageSrc = imageEnvelope
    ? getURLfromImage({ image: imageEnvelope })
    : getHashiconUrl(entity.id)
  const image = imageEnvelope?.image as
    | ({ presentationMode?: 'cover' | 'contain' } & Record<string, unknown>)
    | undefined
  const imageLayout = image?.presentationMode === 'contain' ? 'contain' : 'cover'
  const title = String(
    getIndexCardPropertyValue(entity, keyMap, localeKey, keyMap.title) ?? '',
  )
  const description = toDescriptionFallback(
    getIndexCardPropertyValue(entity, keyMap, localeKey, keyMap.description ?? ''),
  )
  const publicationState =
    'isPublished' in entity && entity.isPublished !== undefined
      ? Boolean(entity.isPublished)
      : null

  let shortLabel = title
  switch (resourceType) {
    case FirstClassResource.hub:
      shortLabel =
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        getI18n(entity, 'nameShort', preferences, '', false) ||
        title
      break
    case FirstClassResource.organisation:
      shortLabel =
        appCtx.getContextualOrganisationName(entity as never, false, false) ||
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        title
      break
    case FirstClassResource.project:
      shortLabel =
        appCtx.getContextualProjectName(entity as never, false, false) ||
        ('code' in entity && typeof entity.code === 'string' && entity.code) ||
        title
      break
    case FirstClassResource.layer:
      shortLabel =
        appCtx.getContextualLayerName(entity as never, false, false) ||
        ('id' in entity && typeof entity.id === 'string' && entity.id) ||
        title
      break
    case FirstClassResource.feature:
      shortLabel = ''
      break
  }

  const footerStatus =
    publicationState !== null || shortLabel
      ? {
          icon:
            publicationState === null ? null : publicationState ? EyeIcon : EyeOffIcon,
          label: shortLabel,
          tooltip:
            publicationState === null
              ? undefined
              : publicationState
                ? m.published()
                : m.forms__unpublished(),
          tone:
            publicationState === null ? null : publicationState ? 'published' : 'draft',
        }
      : null

  const breadcrumbs = [] as NonNullable<IndexCardProps['breadcrumbs']>
  if (resourceType) {
    const hierarchy = appCtx.getHierarchySync(entity as never)

    if (resourceType !== FirstClassResource.layer && hierarchy.layer) {
      const label =
        appCtx.getContextualLayerName(hierarchy.layer, false, false) ??
        hierarchy.layer.id
      if (label) {
        breadcrumbs.push({
          label,
          icon: LayersIcon,
          tooltip: m.active_bold_cobra_grin(),
          iconClass: 'bits-index-card__crumb-icon--layer',
        })
      }
    }

    if (resourceType !== FirstClassResource.project && hierarchy.project) {
      const label =
        appCtx.getContextualProjectName(hierarchy.project, false, false) ??
        hierarchy.project.code
      if (label) {
        breadcrumbs.push({
          label,
          icon: ProjectIcon,
          tooltip: m.deft_mealy_ant_vent(),
          iconClass: 'bits-index-card__crumb-icon--project',
        })
      }
    }

    if (resourceType !== FirstClassResource.organisation && hierarchy.organisation) {
      const label =
        appCtx.getContextualOrganisationName(hierarchy.organisation, false, false) ??
        hierarchy.organisation.code
      if (label) {
        breadcrumbs.push({
          label,
          icon: OrganisationIcon,
          tooltip: m.field_organisation(),
          iconClass: 'bits-index-card__crumb-icon--organisation',
        })
      }
    }
  }

  const href =
    resourceType != null
      ? `${getUrlForResource(adminCtx, resourceType, entity.id)}${search}`
      : null

  return {
    title,
    description,
    imageSrc,
    imageAlt: title,
    imageLayout,
    footerStatus,
    breadcrumbs,
    onNavigate:
      href == null
        ? undefined
        : event => {
            event.preventDefault()
            adminCtx.setFacet('core')
            goto(href)
          },
    onImageClick: onImageClick ? () => onImageClick(entity) : undefined,
  }
}
