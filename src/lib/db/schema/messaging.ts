// DRIZZLE
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
// SCHEMA
import { organisation } from './organisation'
import { user } from './user'
// TYPES
import type { BridgeMessage, SendRequest } from '#lib/messaging/types.js'

const platforms = ['whatsapp', 'telegram'] as const

/** Organisation-owned bridge identity. Credentials remain in private bridge storage. */
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

/** A user's preferred delivery platform is distinct from their external identity. */
export const userMessagingPreference = sqliteTable(
  'userMessagingPreference',
  {
    userId: text('userId')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    platform: text('platform', { enum: platforms }),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    check(
      'messaging_preference_platform',
      sql`${table.platform} IS NULL OR ${table.platform} IN ('whatsapp', 'telegram')`,
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
    address: text('address').notNull(),
    // Raw profile number used for automatic discovery; changing it invalidates the association.
    sourceTelephone: text('sourceTelephone'),
    verifiedAt: integer('verifiedAt'),
    verifiedBy: text('verifiedBy').references(() => user.id, { onDelete: 'set null' }),
    updatedAt: integer('updatedAt').notNull(),
  },
  table => [
    primaryKey({ columns: [table.userId, table.platform] }),
    uniqueIndex('messaging_identity_address').on(table.platform, table.address),
    check(
      'messaging_identity_platform',
      sql`${table.platform} IN ('whatsapp', 'telegram')`,
    ),
  ],
)

/** One platform thread remains pinned even when the recipient changes preference. */
export const messagingConversation = sqliteTable(
  'messagingConversation',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId')
      .notNull()
      .references(() => messagingAccount.id, { onDelete: 'cascade' }),
    chatId: text('chatId').notNull(),
    recipientUserId: text('recipientUserId').references(() => user.id, {
      onDelete: 'set null',
    }),
    displayName: text('displayName'),
    lastMessageAt: integer('lastMessageAt').notNull().default(0),
    isArchived: integer('isArchived', { mode: 'boolean' }).notNull().default(false),
    archiveSequence: integer('archiveSequence').notNull().default(0),
  },
  table => [
    uniqueIndex('messaging_conversation_native').on(table.accountId, table.chatId),
    index('messaging_conversation_recipient').on(table.recipientUserId),
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
