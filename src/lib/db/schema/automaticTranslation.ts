// DRIZZLE
import { integer, text } from 'drizzle-orm/sqlite-core'
// TYPES
import type {
  AutomaticTranslations,
  TranslationProvenance,
} from '#lib/i18n/automatic.js'

/** Add independent generated values and accepted provenance to an existing locale row.
 * @returns Fresh column builders for each owning i18n table.
 * @remarks Nullable metadata does not infer approval for legacy generated values.
 */
export function automaticTranslationColumns() {
  return {
    isAutomaticOnly: integer('isAutomaticOnly', { mode: 'boolean' })
      .notNull()
      .default(false),
    autoTranslated: text('autoTranslated', {
      mode: 'json',
    }).$type<AutomaticTranslations>(),
    translationProvenance: text('translationProvenance', {
      mode: 'json',
    }).$type<TranslationProvenance>(),
  }
}
