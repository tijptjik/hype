// NODE
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
// BUN
import { Database } from 'bun:sqlite'

/**
 * Preserve a consistent mirror, including committed WAL contents, before refresh.
 * @param mirrorPath Existing local mirror path.
 * @returns New backup path. Existing backups are never overwritten.
 */
export function backupMirror(mirrorPath: string): string {
  const output = resolve(
    dirname(mirrorPath),
    'backups',
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.sqlite`,
  )
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 })
  const db = new Database(mirrorPath, { readonly: true })
  try {
    db.run('VACUUM INTO ?', [output])
  } finally {
    db.close()
  }
  chmodSync(output, 0o600)
  const copy = new Database(output, { readonly: true })
  try {
    const result = copy.query('PRAGMA integrity_check').get() as {
      integrity_check: string
    }
    if (result.integrity_check !== 'ok')
      throw new Error('Mirror backup integrity check failed')
  } finally {
    copy.close()
  }
  return output
}
