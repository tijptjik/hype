// SHARED FORM TEXT
import { hasMeaningfulText as hasProfileText } from '../formI18nSection/text'
export { hasMeaningfulText as hasProfileText } from '../formI18nSection/text'
// CONTENT LOCALES
import { contentFormKey } from '#lib/i18n/contentRecords.js'

export type ProfileField = 'title' | 'description'
export type ProfileValues = Record<string, { title?: string | null; description?: string | null } | undefined>
export type ProfileTranslationResult = { locale: string; status: 'translated' | 'unsupported' | 'error' | 'stale' }
export type ProfileProviderResult = { status: 'translated'; text: string } | { status: 'unsupported' | 'error'; message: string }

export interface ProfileTranslationController {
  touch(locale: string, field: ProfileField): void
  cancel(): void
  run(source: string, field: ProfileField, selected: readonly string[]): Promise<ProfileTranslationResult[]>
}

/** Create per-form, bounded translation jobs with immutable source/target snapshots.
 * @param options Live form accessors and nonmutating provider callback.
 * @returns Bulk runner, edit invalidation and disposal operations.
 * @remarks Visibility never limits targets. Call touch when an edit starts, even if
 * the target is still empty, and cancel on reset/unmount. Applying a result is synchronous.
 */
export function createProfileTranslator(options: {
  values: () => ProfileValues
  context: () => unknown
  locked: (field: ProfileField) => boolean
  translate: (source: string, target: string, text: string) => Promise<ProfileProviderResult>
  apply: (field: ProfileField, locale: string, text: string) => void
}): ProfileTranslationController {
  let epoch = 0
  const revisions = new Map<string, number>()
  const running = new Set<ProfileField>()
  const read = (locale: string, field: ProfileField): string => options.values()[contentFormKey(locale)]?.[field] ?? ''
  const revision = (locale: string, field: ProfileField): number => revisions.get(`${locale}:${field}`) ?? 0
  return {
    touch(locale: string, field: ProfileField): void {
      revisions.set(`${locale}:${field}`, revision(locale, field) + 1)
    },
    cancel(): void { epoch++ },
    async run(source: string, field: ProfileField, selected: readonly string[]): Promise<ProfileTranslationResult[]> {
      if (running.has(field) || options.locked(field)) return []
      const text = read(source, field)
      if (!hasProfileText(text)) return []
      const context = options.context()
      const token = epoch
      const sourceRevision = revision(source, field)
      const targets = [...new Set(selected)].filter(locale => locale !== source && !hasProfileText(read(locale, field)))
        .map(locale => ({ locale, revision: revision(locale, field) }))
      const results: ProfileTranslationResult[] = []
      running.add(field)
      let next = 0
      const valid = (): boolean => token === epoch && context === options.context() && !options.locked(field)
        && text === read(source, field) && sourceRevision === revision(source, field)
      try {
        // At most three requests are outstanding, including hidden selected targets.
        await Promise.all(Array.from({ length: Math.min(3, targets.length) }, async () => {
          while (next < targets.length) {
            const target = targets[next++]
            if (!valid() || hasProfileText(read(target.locale, field)) || target.revision !== revision(target.locale, field)) {
              results.push({ locale: target.locale, status: 'stale' }); continue
            }
            try {
              const result = await options.translate(source, target.locale, text)
              if (!valid() || hasProfileText(read(target.locale, field)) || target.revision !== revision(target.locale, field)) {
                results.push({ locale: target.locale, status: 'stale' }); continue
              }
              if (result.status === 'translated' && hasProfileText(result.text)) {
                options.apply(field, target.locale, result.text)
                results.push({ locale: target.locale, status: 'translated' })
              } else results.push({ locale: target.locale, status: result.status === 'unsupported' ? 'unsupported' : 'error' })
            } catch { results.push({ locale: target.locale, status: 'error' }) }
          }
        }))
        return results
      } finally { running.delete(field) }
    },
  }
}
