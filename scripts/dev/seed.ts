// AUTH
import { DEV_PERSONAS } from '../../src/lib/auth/dev-personas'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Prepares reserved development users without changing mirrored identities.
 * @param db - Validated local D1 binding only.
 * @returns Nothing once both users and the admin role are ready.
 * @remarks An existing identity collision or privileged ordinary persona fails closed.
 */
export async function seedDevPersonas(db: D1Database): Promise<void> {
  const core = await db
    .prepare('SELECT id FROM hub WHERE code = ?')
    .bind('core')
    .first<{ id: string }>()
  if (!core)
    throw new Error(
      'Restore the production mirror and apply local migrations first: core hub is missing',
    )
  // Reject collisions before inserting anything into the restored mirror.
  for (const persona of Object.values(DEV_PERSONAS)) {
    const matches = await db
      .prepare(
        'SELECT id, username, email, isArchived, isAnonymous FROM user WHERE id = ? OR lower(username) = lower(?) OR lower(email) = lower(?)',
      )
      .bind(persona.id, persona.username, persona.email)
      .all<{
        id: string
        username: string
        email: string
        isArchived: number
        isAnonymous: number
      }>()
    if (
      matches.results.some(
        row =>
          row.id !== persona.id ||
          row.username !== persona.username ||
          row.email !== persona.email ||
          row.isArchived ||
          row.isAnonymous,
      )
    ) {
      throw new Error(
        'Reserved development identity collision; no mirrored user will be reused',
      )
    }
  }
  const ordinaryId = DEV_PERSONAS.user.id
  for (const table of ['hubRole', 'organisationRole', 'projectRole'] as const) {
    const role = await db
      .prepare(`SELECT userId FROM ${table} WHERE userId = ? LIMIT 1`)
      .bind(ordinaryId)
      .first()
    if (role)
      throw new Error(
        'Ordinary development persona has roles; remove those local assignments before continuing',
      )
  }
  const now = Date.now()
  // Commit the reserved users and core-admin assignment together; repeated runs do not duplicate rows.
  await db.batch([
    ...Object.values(DEV_PERSONAS).map(persona =>
      db
        .prepare(
          'INSERT INTO user (id, name, username, displayUsername, email, emailVerified, isAnonymous, isArchived, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(
          persona.id,
          persona.name,
          persona.username,
          persona.username,
          persona.email,
          now,
          now,
        ),
    ),
    db
      .prepare(
        'INSERT INTO hubRole (hubId, userId, role) VALUES (?, ?, ?) ON CONFLICT(hubId, userId) DO UPDATE SET role = excluded.role',
      )
      .bind(core.id, DEV_PERSONAS.admin.id, 'admin'),
  ])
}
