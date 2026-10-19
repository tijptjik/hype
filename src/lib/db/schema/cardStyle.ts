// DRIZZLE
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// CATALOGUE
import { CARD_STYLE_CODES } from '#lib/features/cardStyle.js'

/** Code-owned renderer catalogue, registered by migrations rather than admin CRUD. */
export const cardStyle = sqliteTable('cardStyle', {
  code: text('code', { enum: CARD_STYLE_CODES }).primaryKey(),
})
