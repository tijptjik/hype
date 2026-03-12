// I18N
import { m } from '$lib/i18n'
// TYPES
import type { KeyMap } from '$lib/types'

type UnknownRecord = Record<string, unknown>

export function getNestedValue(obj: unknown, path: string): unknown {
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

export function getEntityCardPropertyValue(
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

export function toDescriptionPreview(value: unknown): string {
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

export function toDescriptionFallback(value: unknown): string {
  return toDescriptionPreview(value) || m.loved_spare_hyena_imagine()
}
