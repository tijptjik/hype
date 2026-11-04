import type { MessageJournal } from './journal'

export interface DisplayProfile {
  jid: string
  name: string | null
  username: string | null
  phone: string | null
  aliases: string[]
  photo: string | null
}
export interface PrivateProfile extends Omit<DisplayProfile, 'photo'> {
  photoUrl: string | null
}
interface ContactName {
  jid: string
  name: string | null
  username: string | null
  aliases: string[]
  timestamp: number
}

/** Account-local identity cache. Only bounded image bytes, never source URLs, leave it. */
export class ProfileDirectory {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly journal: MessageJournal,
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS contact_names (jid TEXT PRIMARY KEY, data TEXT NOT NULL, timestamp INTEGER NOT NULL)',
    )
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS display_profiles (jid TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL)',
    )
  }

  /** Apply phone address-book sync without confusing saved names with push names. */
  contacts(json: string): void {
    const entries: ContactName[] = JSON.parse(json)
    this.storage.transactionSync(() => {
      for (const entry of entries) {
        const previous = this.storage.sql
          .exec<{ data: string }>(
            'SELECT data FROM contact_names WHERE jid=?',
            entry.jid,
          )
          .toArray()[0]
        const aliases: string[] = previous
          ? [...new Set([...JSON.parse(previous.data).aliases, ...entry.aliases])]
          : entry.aliases
        for (const jid of aliases) {
          this.storage.sql.exec(
            'INSERT INTO contact_names (jid, data, timestamp) VALUES (?, ?, ?) ON CONFLICT(jid) DO UPDATE SET data=excluded.data, timestamp=excluded.timestamp WHERE excluded.timestamp>=contact_names.timestamp',
            jid,
            JSON.stringify(entry),
            entry.timestamp,
          )
          this.storage.sql.exec('DELETE FROM display_profiles WHERE jid=?', jid)
        }
      }
    })
  }

  cached(jid: string): DisplayProfile | null {
    const row = this.storage.sql
      .exec<{ data: string }>(
        'SELECT data FROM display_profiles WHERE jid=? AND expires>?',
        jid,
        Date.now(),
      )
      .toArray()[0]
    return row ? JSON.parse(row.data) : null
  }

  /** Save resolved aliases and prefer an actual saved contact name over a push name. */
  async save(input: PrivateProfile): Promise<DisplayProfile> {
    let saved: ContactName | null = null
    for (const jid of input.aliases) {
      const row = this.storage.sql
        .exec<{ data: string }>('SELECT data FROM contact_names WHERE jid=?', jid)
        .toArray()[0]
      if (row) {
        const value: ContactName = JSON.parse(row.data)
        if (!saved || value.timestamp > saved.timestamp) saved = value
      }
    }
    const profile: DisplayProfile = {
      jid: input.jid,
      aliases: input.aliases,
      phone: input.phone,
      name: saved?.name || input.name || this.journal.senderName(input.aliases),
      username: input.username || saved?.username || null,
      photo: input.photoUrl ? await thumbnail(input.photoUrl).catch(() => null) : null,
    }
    this.storage.sql.exec(
      'INSERT INTO display_profiles (jid, data, expires) VALUES (?, ?, ?) ON CONFLICT(jid) DO UPDATE SET data=excluded.data, expires=excluded.expires',
      input.jid,
      JSON.stringify(profile),
      Date.now() + 60 * 60 * 1000,
    )
    await this.storage.sync()
    return profile
  }
}

/** Fetch a small SDK-discovered thumbnail without disclosing its signed URL.
 * Redirects and non-WhatsApp CDN hosts are rejected before a body is read.
 */
async function thumbnail(address: string): Promise<string | null> {
  const url = new URL(address)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !['whatsapp.net', 'whatsapp.com', 'fbcdn.net'].some(
      domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  )
    return null
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
  })
  if (
    !response.ok ||
    Number(response.headers.get('content-length') ?? 0) > 128 * 1024
  ) {
    await response.body?.cancel()
    return null
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const parts: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      length += item.value.length
      if (length > 128 * 1024) {
        await reader.cancel()
        return null
      }
      parts.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  const mime =
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'image/jpeg'
      : bytes[0] === 137 && new TextDecoder().decode(bytes.subarray(1, 4)) === 'PNG'
        ? 'image/png'
        : new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
            new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
          ? 'image/webp'
          : null
  if (!mime) return null
  let binary = ''
  for (let start = 0; start < bytes.length; start += 4096)
    binary += String.fromCharCode(...bytes.subarray(start, start + 4096))
  return `data:${mime};base64,${btoa(binary)}`
}
