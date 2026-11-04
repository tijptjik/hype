// DRIZZLE
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// SCHEMA
import { organisation } from './organisation'
import { user } from './user'
// TYPES
import type { BridgeMessage, SendRequest } from '#lib/messaging/types.js'

const platforms = ['whatsapp', 'telegram'] as const

/** Linked provider account assigned to one organisation for access control. Credentials remain in private bridge storage. */
export const messagingAccount = sqliteTable(
  'messagingAccount',
  {
    id: text('id').primaryKey(),
    organisationId: text('organisationId')
      .notNull()
      .references(() => organisation.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: platforms }).notNull(),
    bridgeAccountId: text('bridgeAccountId').notNull().unique(),
    externalAccountId: text('externalAccountId'),
    displayName: text('displayName'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
    inboxCursor: integer('inboxCursor').notNull().default(0),
    archiveCursor: integer('archiveCursor').notNull().default(0),
    registeredBy: text('registeredBy').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('createdAt').notNull(),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    uniqueIndex('messaging_account_org_platform').on(
      table.organisationId,
      table.platform,
    ),
    uniqueIndex('messaging_account_external').on(
      table.platform,
      table.externalAccountId,
    ),
    check(
      'messaging_account_platform',
      sql`${table.platform} IN ('whatsapp', 'telegram')`,
    ),
  ],
)

/** Only verified associations may drive automatic routing; names never establish identity. */
export const userMessagingIdentity = sqliteTable(
  'userMessagingIdentity',
  {
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: platforms }).notNull(),
    phoneNumber: text('phoneNumber'),
    username: text('username'),
    nativeId: text('nativeId'),
    // Raw profile number used for automatic discovery; changing it invalidates the association.
    sourceTelephone: text('sourceTelephone'),
    verifiedAt: integer('verifiedAt'),
    verifiedBy: text('verifiedBy').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.platform] }),
    uniqueIndex('messaging_identity_native_id').on(table.platform, table.nativeId),
    check(
      'messaging_identity_platform',
      sql`${table.platform} IN ('whatsapp', 'telegram')`,
    ),
    check(
      'messaging_identity_identifier',
      sql`${table.phoneNumber} IS NOT NULL OR ${table.username} IS NOT NULL OR ${table.nativeId} IS NOT NULL`,
    ),
    check(
      'messaging_identity_verified_native_id',
      sql`${table.verifiedAt} IS NULL OR ${table.nativeId} IS NOT NULL`,
    ),
  ],
)

/** Verified provider aliases share one ownership namespace, including the canonical native ID.
 * @remarks Migration triggers maintain canonical aliases and clear them when verification changes.
 */
export const userMessagingIdentityAlias = sqliteTable(
  'userMessagingIdentityAlias',
  {
    userId: text('userId').notNull(),
    platform: text('platform', { enum: platforms }).notNull(),
    nativeId: text('nativeId').notNull(),
  },
  table => [
    primaryKey({ columns: [table.platform, table.nativeId] }),
    index('messaging_identity_alias_user').on(table.userId, table.platform),
    foreignKey({
      columns: [table.userId, table.platform],
      foreignColumns: [userMessagingIdentity.userId, userMessagingIdentity.platform],
    }).onDelete('cascade'),
  ],
)

/** Account-owned native chat, including imported contacts and groups with no HYPE association. */
export const messagingConversation = sqliteTable(
  'messagingConversation',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId')
      .notNull()
      .references(() => messagingAccount.id, { onDelete: 'cascade' }),
    chatId: text('chatId').notNull(),
    // Optional enrichment; account access and chat visibility do not depend on HYPE membership.
    recipientUserId: text('recipientUserId').references(() => user.id, {
      onDelete: 'set null',
    }),
    displayName: text('displayName'),
    lastMessageAt: integer('lastMessageAt').notNull().default(0),
    isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
    pinnedAt: integer('pinnedAt'),
    archiveSequence: integer('archiveSequence').notNull().default(0),
  },
  table => [
    uniqueIndex('messaging_conversation_native').on(table.accountId, table.chatId),
    index('messaging_conversation_recipient').on(table.recipientUserId),
    index('messaging_conversation_pins').on(
      table.accountId,
      table.isArchived,
      sql`${table.pinnedAt} DESC`,
      sql`${table.lastMessageAt} DESC`,
      table.id,
    ),
    index('messaging_conversation_archive').on(
      table.accountId,
      table.isArchived,
      table.lastMessageAt,
    ),
  ],
)

/** Queryable application projection; bridge sequence makes repeated sync idempotent. */
export const messagingMessage = sqliteTable(
  'messagingMessage',
  {
    accountId: text('accountId')
      .notNull()
      .references(() => messagingAccount.id, { onDelete: 'cascade' }),
    chatId: text('chatId').notNull(),
    messageId: text('messageId').notNull(),
    senderId: text('senderId').notNull(),
    sourceSequence: integer('sourceSequence').notNull(),
    timestamp: integer('timestamp').notNull(),
    payload: text('payload', { mode: 'json' }).$type<BridgeMessage>().notNull(),
  },
  table => [
    primaryKey({
      columns: [table.accountId, table.chatId, table.messageId, table.senderId],
    }),
    index('messaging_message_history').on(
      table.accountId,
      table.chatId,
      table.timestamp,
    ),
  ],
)

/** Immutable route and operator attribution survive ambiguous provider responses. */
export const messagingSend = sqliteTable(
  'messagingSend',
  {
    accountId: text('accountId')
      .notNull()
      .references(() => messagingAccount.id, { onDelete: 'cascade' }),
    requestId: text('requestId').notNull(),
    actorUserId: text('actorUserId').references(() => user.id, {
      onDelete: 'set null',
    }),
    recipientUserId: text('recipientUserId').references(() => user.id, {
      onDelete: 'set null',
    }),
    request: text('request', { mode: 'json' }).$type<SendRequest>().notNull(),
    state: text('state', { enum: ['pending', 'submitted', 'uncertain'] }).notNull(),
    messageId: text('messageId').notNull().default(''),
    createdAt: integer('createdAt').notNull(),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    primaryKey({ columns: [table.accountId, table.requestId] }),
    index('messaging_send_recent').on(table.accountId, table.createdAt),
    check(
      'messaging_send_state',
      sql`${table.state} IN ('pending', 'submitted', 'uncertain')`,
    ),
  ],
)

/** Expiring account-scoped discovery results; never an identity ownership claim. */
export const messagingPhoneLookup = sqliteTable(
  'messagingPhoneLookup',
  {
    accountId: text('accountId')
      .notNull()
      .references(() => messagingAccount.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    externalAccountId: text('externalAccountId').notNull(),
    telephone: text('telephone').notNull(),
    address: text('address'),
    reason: text('reason'),
    checkedAt: integer('checkedAt').notNull(),
    expiresAt: integer('expiresAt').notNull(),
  },
  table => [primaryKey({ columns: [table.accountId, table.userId] })],
)
