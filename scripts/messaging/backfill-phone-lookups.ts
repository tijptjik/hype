/** Seed local messaging discovery without sending messages or creating identities.
 * Usage: bun scripts/messaging/backfill-phone-lookups.ts --organisation hkfoodworks --database /absolute/local.sqlite [--apply] [--limit 50]
 * Fresh rows are skipped, so rerunning resumes the backfill. Only local bridge services are used.
 */
import { Database } from 'bun:sqlite'
import { getPlatformProxy } from 'wrangler'
import { normalizeTelephone } from '../../src/lib/utils/telephone'

const args = process.argv.slice(2)
const option = (name: string): string | undefined => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const database = option('--database'), organisation = option('--organisation')
const apply = args.includes('--apply'), limit = Number(option('--limit') ?? 50)
if (!database?.startsWith('/') || !organisation || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Provide --database /absolute/local.sqlite --organisation CODE and --limit 1..500; --apply performs checks')
const db = new Database(database, { readonly: !apply, strict: true, create: false })
type Candidate = { userId: string; telephone: string; accountId: string; platform: 'whatsapp' | 'telegram'; bridgeAccountId: string; externalAccountId: string }
const rows = db.query<Candidate, [number, string, number]>(`
 SELECT u.id AS userId,u.telephone,a.id AS accountId,a.platform,a.bridgeAccountId,a.externalAccountId
 FROM user u
 JOIN messagingAccount a ON a.platform IN ('whatsapp','telegram')
 JOIN organisation o ON o.id=a.organisationId
 LEFT JOIN userMessagingIdentity i ON i.userId=u.id AND i.platform=a.platform AND i.verifiedAt IS NOT NULL AND (i.sourceTelephone IS NULL OR i.sourceTelephone=u.telephone)
 LEFT JOIN messagingPhoneLookup c ON c.accountId=a.id AND c.userId=u.id AND c.telephone=u.telephone AND c.externalAccountId=a.externalAccountId AND c.expiresAt>?
 WHERE o.code=? AND o.isArchived=0 AND a.enabled=1 AND a.externalAccountId IS NOT NULL
 AND u.isArchived=0 AND u.isAnonymous=0 AND u.username IS NOT NULL AND u.telephone IS NOT NULL
 AND i.userId IS NULL AND c.userId IS NULL ORDER BY u.id,a.platform LIMIT ?
` as string).all(Date.now(), organisation, limit)
// Output only aggregate counts; profile phones and bridge credentials stay private.
console.log(JSON.stringify({ organisation, candidates: rows.length, mode: apply ? 'apply' : 'dry-run', limit }))
if (!apply) { db.close(); process.exit(0) }
const proxy = await getPlatformProxy({ configPath: new URL('./backfill.wrangler.jsonc', import.meta.url).pathname, persist: false, remoteBindings: false, envFiles: [] })
let checked = 0, registered = 0, unavailable = 0
try {
 for (const row of rows) {
  const phone = normalizeTelephone(row.telephone)
  let address: string | null = null, reason: string | null = null
  const label = row.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'
  if (!phone) reason = 'No valid phone number on this HYPE profile'
  else try {
   const bridge = proxy.env[row.platform === 'whatsapp' ? 'WA' : 'TG'] as { lookupPhone(account: string, phone: string): Promise<{ status: string; address?: string }> }
   const result = await bridge.lookupPhone(row.bridgeAccountId, phone)
   if (result.status === 'registered' && result.address && (row.platform === 'whatsapp' ? /^[1-9]\d{6,14}@s\.whatsapp\.net$/ : /^[1-9]\d*$/).test(result.address)) address = result.address
   else reason = result.status === 'not_found' ? `No ${label} account found for the saved phone number` : result.status === 'unresolved' ? 'Telegram could not resolve this number; it may be hidden by privacy settings or not registered' : `${label} lookup is temporarily unavailable; try again`
  } catch { reason = `${label} lookup is temporarily unavailable; try again` }
  if (address) {
   const owner = db.query<{ userId: string }, [string, string]>('SELECT userId FROM userMessagingIdentity WHERE platform=? AND address=?').get(row.platform, address)
   const thread = db.query<{ recipientUserId: string | null }, [string, string]>('SELECT recipientUserId FROM messagingConversation WHERE accountId=? AND chatId=?').get(row.accountId, address)
   if ((owner && owner.userId !== row.userId) || (thread?.recipientUserId && thread.recipientUserId !== row.userId)) { address = null; reason = 'This account belongs to a different HYPE user; review the phone number' }
  }
  const now = Date.now(), temporary = reason?.includes('temporarily unavailable')
  // Persist only while both the profile and organisation account still match the checked inputs.
  db.query(`INSERT INTO messagingPhoneLookup(accountId,userId,externalAccountId,telephone,address,reason,checkedAt,expiresAt)
   SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user WHERE id=? AND telephone=?) AND EXISTS(SELECT 1 FROM messagingAccount WHERE id=? AND externalAccountId=?)
   ON CONFLICT(accountId,userId) DO UPDATE SET externalAccountId=excluded.externalAccountId,telephone=excluded.telephone,address=excluded.address,reason=excluded.reason,checkedAt=excluded.checkedAt,expiresAt=excluded.expiresAt`)
   .run(row.accountId,row.userId,row.externalAccountId,row.telephone,address,reason,now,now+(address?7*86400000:temporary?60000:86400000),row.userId,row.telephone,row.accountId,row.externalAccountId)
  checked++; if (address) registered++; if (temporary) { unavailable++; break }
  await Bun.sleep(500)
 }
 console.log(JSON.stringify({ checked, registered, unavailable, remaining: rows.length - checked }))
} finally { await proxy.dispose(); db.close() }
