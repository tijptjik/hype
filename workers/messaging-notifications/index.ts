/// <reference path="./worker-configuration.d.ts" />
// CLOUDFLARE
import { DurableObject, WorkerEntrypoint } from 'cloudflare:workers'
import {
  buildPushPayload,
  type PushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push'

interface Bridge {
  watch(account: string, viewer: string): Promise<unknown>
  unwatch(account: string, viewer: string): Promise<void>
  snapshot(account: string, after: number): Promise<{ messages: Message[] }>
}
interface Message {
  id: string
  chat: string
  sender: string
  sequence: number
  timestamp: number
  fromMe: boolean
  readByMe?: boolean
  deleted?: boolean
  content?: { kind: string }
}
interface Env extends Omit<MessagingNotificationBindings, 'WHATSOVER' | 'TELEGRAM'> {
  WHATSOVER: Bridge
  TELEGRAM: Bridge
}
type SubscriptionRow = {
  id: string
  user_id: string
  org_id: string
  origin: string
  data: string
  created: number
  expires: number
  muted_until: number
}
interface Account {
  id: string
  organisationId: string
  platform: 'whatsapp' | 'telegram'
  bridgeAccountId: string
}

/** Restrict push delivery to browser vendors; subscription input must never become an arbitrary fetch.
 * @param endpoint Browser-generated push endpoint.
 * @returns Whether the endpoint belongs to a supported HTTPS push vendor.
 */
export function validEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      (url.hostname === 'fcm.googleapis.com' ||
        url.hostname === 'web.push.apple.com' ||
        url.hostname.endsWith('.push.services.mozilla.com') ||
        url.hostname.endsWith('.notify.windows.com'))
    )
  } catch {
    return false
  }
}
/** Encode private key material without logging or exporting it to the browser. */
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

/** One coordinator per organisation owns subscriptions, replay cursors and delivery deduplication. */
export class NotificationDelivery extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`
 CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,user_id TEXT,org_id TEXT,origin TEXT,data TEXT,created INTEGER,expires INTEGER,muted_until INTEGER DEFAULT 0);
 CREATE TABLE IF NOT EXISTS cursors(account TEXT PRIMARY KEY,sequence INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS delivered(subscription TEXT,message TEXT,expires INTEGER,PRIMARY KEY(subscription,message));
 `)
  }
  /** Recheck actual current role membership before any subscription is used. */
  private async authorized(userId: string, orgId: string): Promise<boolean> {
    return Boolean(
      await this.env.DB.prepare(
        `SELECT 1 FROM user u JOIN organisation o ON o.id=? WHERE u.id=? AND u.isAnonymous=0 AND u.isArchived=0 AND o.isArchived=0 AND (EXISTS(SELECT 1 FROM organisationRole r WHERE r.organisationId=o.id AND r.userId=u.id AND r.role IN ('member','owner')) OR EXISTS(SELECT 1 FROM hubRole r JOIN hub h ON h.id=r.hubId WHERE r.userId=u.id AND r.role='admin' AND (r.hubId=o.hubId OR h.code='core')))`,
      )
        .bind(orgId, userId)
        .first(),
    )
  }
  private keyPromise?: Promise<VapidKeys>
  /** Private-namespace RPC for shared browser signing keys; never exposed by the Worker entrypoint.
   * @returns Persisted VAPID keys, generated once and retained across restarts.
   */
  async signingKeys(): Promise<VapidKeys> {
    return (this.keyPromise ??= this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<VapidKeys>('vapid')
      if (previous) return previous
      const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      )
      const raw = await crypto.subtle.exportKey('raw', pair.publicKey),
        jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
      const value = {
        publicKey: base64url(new Uint8Array(raw)),
        privateKey: jwk.d!,
        subject: 'mailto:notifications@localhost',
      }
      await this.ctx.storage.put('vapid', value)
      return value
    }))
  }
  async publicKey(): Promise<string> {
    return (await this.signingKeys()).publicKey!
  }
  private async identifier(
    userId: string,
    orgId: string,
    endpoint: string,
  ): Promise<string> {
    return base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(JSON.stringify([userId, orgId, endpoint])),
        ),
      ),
    )
  }
  async subscribe(
    userId: string,
    orgId: string,
    subscription: PushSubscription,
    origin: string,
  ): Promise<void> {
    if (
      !validEndpoint(subscription.endpoint) ||
      !subscription.keys?.p256dh ||
      !subscription.keys.auth ||
      subscription.keys.p256dh.length > 256 ||
      subscription.keys.auth.length > 128
    )
      throw new Error('Invalid browser subscription')
    if (!(await this.authorized(userId, orgId)))
      throw new Error('Organisation access required')
    // Reject unusable browser keys before storing a subscription that could stall retries.
    try {
      const decode = (value: string) => {
        if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error('Invalid encoding')
        return Uint8Array.from(
          atob(value.replaceAll('-', '+').replaceAll('_', '/')),
          char => char.charCodeAt(0),
        )
      }
      const publicKey = decode(subscription.keys.p256dh)
      if (publicKey.length !== 65 || decode(subscription.keys.auth).length !== 16)
        throw new Error('Invalid key length')
      await crypto.subtle.importKey(
        'raw',
        publicKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
      )
    } catch {
      throw new Error('Invalid browser subscription keys')
    }
    const url = new URL(origin)
    if (
      url.origin !== origin ||
      !(
        url.protocol === 'https:' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === 'localhost'
      )
    )
      throw new Error('Invalid application origin')
    const now = Date.now(),
      id = await this.identifier(userId, orgId, subscription.endpoint)
    this.ctx.storage.sql.exec(
      'INSERT INTO subscriptions(id,user_id,org_id,origin,data,created,expires,muted_until) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET data=excluded.data,origin=excluded.origin,expires=excluded.expires',
      id,
      userId,
      orgId,
      origin,
      JSON.stringify(subscription),
      now,
      now + 30 * 86400000,
    )
    this.ctx.storage.sql.exec(
      'UPDATE delivered SET expires=max(expires,?) WHERE subscription=?',
      now + 30 * 86400000,
      id,
    )
    await this.ctx.storage.setAlarm(now + 1000)
  }
  async unsubscribe(userId: string, orgId: string, endpoint: string): Promise<void> {
    this.ctx.storage.sql.exec(
      'DELETE FROM subscriptions WHERE id=?',
      await this.identifier(userId, orgId, endpoint),
    )
  }
  /** Suppress this browser's desktop alerts while its inbox is visibly focused. */
  async focus(
    userId: string,
    orgId: string,
    endpoint: string,
    focused = true,
  ): Promise<void> {
    this.ctx.storage.sql.exec(
      'UPDATE subscriptions SET muted_until=? WHERE id=?',
      focused ? Date.now() + 45000 : 0,
      await this.identifier(userId, orgId, endpoint),
    )
  }
  async status(userId: string, orgId: string, endpoint: string): Promise<boolean> {
    return Boolean(
      this.ctx.storage.sql
        .exec(
          'SELECT 1 FROM subscriptions WHERE id=? AND expires>?',
          await this.identifier(userId, orgId, endpoint),
          Date.now(),
        )
        .toArray().length,
    )
  }
  async alarm(): Promise<void> {
    const now = Date.now()
    this.ctx.storage.sql.exec('DELETE FROM subscriptions WHERE expires<?', now)
    this.ctx.storage.sql.exec('DELETE FROM delivered WHERE expires<?', now)
    const rows = this.ctx.storage.sql
      .exec<SubscriptionRow>('SELECT * FROM subscriptions')
      .toArray()
    if (!rows.length) return
    // Re-arm before network I/O; a transient provider or push-service error cannot stop future checks.
    await this.ctx.storage.setAlarm(now + 30000)
    const active: SubscriptionRow[] = []
    for (const row of rows) {
      if (await this.authorized(row.user_id, row.org_id)) active.push(row)
      else this.ctx.storage.sql.exec('DELETE FROM subscriptions WHERE id=?', row.id)
    }
    const orgs = [...new Set(active.map(row => row.org_id))]
    for (const org of orgs) {
      const accounts = await this.env.DB.prepare(
        'SELECT id,organisationId,platform,bridgeAccountId FROM messagingAccount WHERE organisationId=? AND enabled=1 AND externalAccountId IS NOT NULL',
      )
        .bind(org)
        .all<Account>()
      for (const account of accounts.results) {
        const service =
          account.platform === 'telegram' ? this.env.TELEGRAM : this.env.WHATSOVER
        try {
          await service.watch(account.bridgeAccountId, 'notification-service')
          const cursor =
            this.ctx.storage.sql
              .exec<{ sequence: number }>(
                'SELECT sequence FROM cursors WHERE account=?',
                account.id,
              )
              .toArray()[0]?.sequence ?? 0
          const snapshot = await service.snapshot(account.bridgeAccountId, cursor)
          let next = cursor,
            retry = false
          for (const message of snapshot.messages) {
            next = Math.max(next, message.sequence)
            if (
              message.fromMe ||
              message.readByMe ||
              message.deleted ||
              ['protocol', 'reaction'].includes(message.content?.kind ?? '')
            )
              continue
            const recipient = await this.env.DB.prepare(
              `SELECT u.id FROM userMessagingIdentity i JOIN user u ON u.id=i.userId LEFT JOIN messagingConversation c ON c.accountId=? AND c.chatId=i.address WHERE i.platform=? AND i.address=? AND i.verifiedAt IS NOT NULL AND (i.sourceTelephone IS NULL OR i.sourceTelephone=u.telephone) AND u.isArchived=0 AND u.isAnonymous=0 AND (c.recipientUserId IS NULL OR c.recipientUserId=u.id)`,
            )
              .bind(account.id, account.platform, message.chat)
              .first()
            if (!recipient) continue
            const key = JSON.stringify([
              account.id,
              message.chat,
              message.sender,
              message.id,
            ])
            for (const candidate of active.filter(
              row => row.org_id === org && message.timestamp >= row.created,
            )) {
              // Focus and unsubscribe can arrive while an earlier network request is pending.
              const row = this.ctx.storage.sql
                .exec<SubscriptionRow>(
                  'SELECT * FROM subscriptions WHERE id=? AND expires>?',
                  candidate.id,
                  Date.now(),
                )
                .toArray()[0]
              if (!row) continue
              if (
                this.ctx.storage.sql
                  .exec(
                    'SELECT 1 FROM delivered WHERE subscription=? AND message=?',
                    row.id,
                    key,
                  )
                  .toArray().length
              )
                continue
              if (row.muted_until > now) {
                this.ctx.storage.sql.exec(
                  'INSERT OR IGNORE INTO delivered VALUES (?,?,?)',
                  row.id,
                  key,
                  row.expires,
                )
                continue
              }
              try {
                const subscription = JSON.parse(row.data) as PushSubscription
                const keys =
                  await this.env.DELIVERY.getByName('notifications').signingKeys()
                keys.subject = row.origin.startsWith('https:')
                  ? row.origin
                  : keys.subject
                const payload = await buildPushPayload(
                  {
                    data: JSON.stringify({
                      title: 'HYPE',
                      body: 'New message in your organisation inbox.',
                      url: row.origin + '/admin/messaging',
                      tag: 'hype-messaging-' + account.id,
                    }),
                    options: { ttl: 300 },
                  },
                  subscription,
                  keys,
                )
                const response = await fetch(subscription.endpoint, {
                  ...payload,
                  redirect: 'error',
                  signal: AbortSignal.timeout(10000),
                })
                await response.body?.cancel()
                if ([400, 401, 403, 404, 410].includes(response.status))
                  this.ctx.storage.sql.exec(
                    'DELETE FROM subscriptions WHERE id=?',
                    row.id,
                  )
                else if (!response.ok) throw new Error('Push delivery unavailable')
                this.ctx.storage.sql.exec(
                  'INSERT OR IGNORE INTO delivered VALUES (?,?,?)',
                  row.id,
                  key,
                  row.expires,
                )
              } catch {
                retry = true
              }
            }
          }
          if (!retry)
            this.ctx.storage.sql.exec(
              'INSERT INTO cursors VALUES (?,?) ON CONFLICT(account) DO UPDATE SET sequence=max(sequence,excluded.sequence)',
              account.id,
              next,
            )
          if (snapshot.messages.length >= 100)
            await this.ctx.storage.setAlarm(Date.now() + 1000)
        } catch {
          console.warn('Messaging notification poll will retry')
        }
      }
    }
  }
}

/** Private RPC only; browser subscription changes must pass HYPE's organisation authorization. */
export default class MessagingNotifications extends WorkerEntrypoint<Env> {
  private delivery(orgId: string) {
    return this.env.DELIVERY.getByName(`organisation:${orgId}`)
  }
  async publicKey() {
    return this.env.DELIVERY.getByName('notifications').publicKey()
  }
  async subscribe(
    userId: string,
    orgId: string,
    subscription: PushSubscription,
    origin: string,
  ) {
    await this.delivery(orgId).subscribe(userId, orgId, subscription, origin)
  }
  async unsubscribe(userId: string, orgId: string, endpoint: string) {
    await this.delivery(orgId).unsubscribe(userId, orgId, endpoint)
  }
  async focus(userId: string, orgId: string, endpoint: string, focused = true) {
    await this.delivery(orgId).focus(userId, orgId, endpoint, focused)
  }
  async status(userId: string, orgId: string, endpoint: string) {
    return this.delivery(orgId).status(userId, orgId, endpoint)
  }
  async fetch() {
    return new Response('Not found', { status: 404 })
  }
}
