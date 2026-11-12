import type { AutomaticTranslation } from '#lib/i18n/automatic.js'
// SHARED FORM TEXT
import { hasMeaningfulText as hasProfileText } from '../formI18nSection/text'
export { hasMeaningfulText as hasProfileText } from '../formI18nSection/text'
// CONTENT LOCALES
import { contentFormKey } from '#lib/i18n/contentRecords.js'

export type ProfileField = 'title' | 'description'
export type ProfileValues<Field extends string = ProfileField> = Record<
  string,
  | (Partial<Record<Field, string | null>> & {
      isAutomaticOnly?: boolean
      autoTranslated?: Record<string, AutomaticTranslation | string> | null
    } & Partial<Record<`${Field}Gen`, boolean | string>>)
  | undefined
>
export type ProfileTranslationResult = {
  locale: string
  status: 'translated' | 'unsupported' | 'error' | 'stale'
}
export type ProfileProviderResult =
  | { status: 'translated'; text: string; automatic?: AutomaticTranslation }
  | { status: 'unsupported' | 'error'; message: string }

export interface ProfileTranslationController<Field extends string = ProfileField> {
  touch(locale: string, field: Field): void
  cancel(): void
  run(
    source: string,
    field: Field,
    selected: readonly string[],
  ): Promise<ProfileTranslationResult[]>
}

/** Create per-form, bounded translation jobs with immutable source/target snapshots.
 * @param options Live form accessors and nonmutating provider callback.
 * @returns Bulk runner, edit invalidation and disposal operations.
 * @remarks Visibility never limits targets. Call touch when an edit starts, even if
 * the target is still empty, and cancel on reset/unmount. Applying a result is synchronous.
 */
export function createProfileTranslator<Field extends string = ProfileField>(options: {
  allowUnconfirmedTargets?: boolean
  values: () => ProfileValues<Field>
  context: () => unknown
  locked: (field: Field) => boolean
  translate: (
    source: string,
    target: string,
    text: string,
  ) => Promise<ProfileProviderResult>
  apply: (
    field: Field,
    locale: string,
    text: string,
    automatic?: AutomaticTranslation,
  ) => void
}): ProfileTranslationController<Field> {
  let epoch = 0
  const revisions = new Map<string, number>()
  const running = new Set<Field>()
  const read = (locale: string, field: Field): string =>
    options.values()[contentFormKey(locale)]?.[field] ?? ''
  const revision = (locale: string, field: Field): number =>
    revisions.get(`${locale}:${field}`) ?? 0
  return {
    touch(locale: string, field: Field): void {
      revisions.set(`${locale}:${field}`, revision(locale, field) + 1)
    },
    cancel(): void {
      epoch++
    },
    async run(
      source: string,
      field: Field,
      selected: readonly string[],
    ): Promise<ProfileTranslationResult[]> {
      if (running.has(field) || options.locked(field)) return []
      const text = options.allowUnconfirmedTargets
        ? read(source, field)
        : publishedProfileText(options.values(), source, field)
      if (!hasProfileText(text)) return []
      const context = options.context()
      const token = epoch
      const sourceRevision = revision(source, field)
      const targets = [...new Set(selected)]
        .filter(
          locale =>
            locale !== source &&
            !hasProfileText(
              options.allowUnconfirmedTargets
                ? publishedProfileText(options.values(), locale, field)
                : read(locale, field),
            ),
        )
        .map(locale => ({
          locale,
          revision: revision(locale, field),
          text: read(locale, field),
        }))
      const results: ProfileTranslationResult[] = []
      running.add(field)
      let next = 0
      const valid = (): boolean =>
        token === epoch &&
        context === options.context() &&
        !options.locked(field) &&
        text === read(source, field) &&
        sourceRevision === revision(source, field)
      try {
        // At most three requests are outstanding, including hidden selected targets.
        await Promise.all(
          Array.from({ length: Math.min(3, targets.length) }, async () => {
            while (next < targets.length) {
              const target = targets[next++]
              if (
                !valid() ||
                read(target.locale, field) !== target.text ||
                (options.allowUnconfirmedTargets &&
                  hasProfileText(
                    publishedProfileText(options.values(), target.locale, field),
                  )) ||
                target.revision !== revision(target.locale, field)
              ) {
                results.push({ locale: target.locale, status: 'stale' })
                continue
              }
              try {
                const result = await options.translate(source, target.locale, text)
                if (
                  !valid() ||
                  read(target.locale, field) !== target.text ||
                  (options.allowUnconfirmedTargets &&
                    hasProfileText(
                      publishedProfileText(options.values(), target.locale, field),
                    )) ||
                  target.revision !== revision(target.locale, field)
                ) {
                  results.push({ locale: target.locale, status: 'stale' })
                  continue
                }
                if (result.status === 'translated' && hasProfileText(result.text)) {
                  options.apply(field, target.locale, result.text, result.automatic)
                  results.push({ locale: target.locale, status: 'translated' })
                } else
                  results.push({
                    locale: target.locale,
                    status: result.status === 'unsupported' ? 'unsupported' : 'error',
                  })
              } catch {
                results.push({ locale: target.locale, status: 'error' })
              }
            }
          }),
        )
        return results
      } finally {
        running.delete(field)
      }
    },
  }
}

/** Read authored/accepted text only; generated suggestions cannot become translation sources.
 * @param values Locale rows. @param locale Content language. @param field Field identity.
 * @returns Published field text or an empty string.
 */
export function publishedProfileText<Field extends string>(
  values: ProfileValues<Field>,
  locale: string,
  field: Field,
): string {
  const row = values[contentFormKey(locale)]
  const generated = row?.[`${field}Gen`]
  return row?.isAutomaticOnly || generated === true || generated === 'true'
    ? ''
    : (row?.[field] ?? '')
}

/** Read a stored machine-generated value that still needs explicit human confirmation.
 * @param values Content rows. @param locale Target language. @param field Field identity.
 * @returns Unconfirmed stored text, or an empty string.
 */
export function unconfirmedProfileText<Field extends string>(
  values: ProfileValues<Field>,
  locale: string,
  field: Field,
): string {
  const row = values[contentFormKey(locale)]
  return row?.[`${field}Gen`] === true || row?.[`${field}Gen`] === 'true'
    ? (row?.[field] ?? '')
    : ''
}
