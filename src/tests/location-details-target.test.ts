// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import ts from 'typescript'
import { and, eq, ne, sql } from 'drizzle-orm'
import { sqliteTable, text, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { z } from 'zod'
import { expect, it, vi } from 'vitest'

it('resolves only existing shared source identities and checks access before reading', async () => {
  const source = readFileSync('src/lib/api/locationDirectory.remote.ts', 'utf8')
  const start = source.indexOf('export const getSharedLocationIdBySource')
  const end = source.indexOf('/**\n * Read a Location by', start)
  const code = ts.transpileModule(
    source.slice(start, end).replace('export const', 'const'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText
  const table = sqliteTable('location', {
    id: text('id'),
    ssId: text('ssId'),
    state: text('state'),
  })
  const db = new DatabaseSync(':memory:')
  db.exec(
    "CREATE TABLE location(id TEXT, ssId TEXT, state TEXT); INSERT INTO location VALUES('shared','source','linked'),('private','private-source','manual')",
  )
  const access = vi.fn(async () => {})
  const read = vi.fn()
  const context = {
    db: {
      select: () => ({
        from: () => ({
          where: (condition: ReturnType<typeof and>) => ({
            get: () => {
              read()
              const query = new SQLiteSyncDialect().sqlToQuery(
                sql`SELECT id FROM location WHERE ${condition}`,
              )
              return db.prepare(query.sql).get(...(query.params as string[]))
            },
          }),
        }),
      }),
    },
  }
  const query = new Function(
    'guardedQuery',
    'z',
    'requireDirectoryAccess',
    'locationTable',
    'and',
    'eq',
    'ne',
    `${code}; return getSharedLocationIdBySource`,
  )(
    (schema: z.ZodType, handler: (input: unknown, ctx: unknown) => unknown) =>
      (input: unknown) =>
        handler(schema.parse(input), context),
    z,
    access,
    table,
    and,
    eq,
    ne,
  )
  try {
    expect(await query({ ssId: 'source' })).toBe('shared')
    expect(await query({ ssId: 'private-source' })).toBeNull()
    expect(await query({ ssId: 'not-imported' })).toBeNull()
    expect(db.prepare('SELECT count(*) count FROM location').get()?.count).toBe(2)
    read.mockClear()
    access.mockRejectedValueOnce(new Error('ACCOUNT_REQUIRED'))
    await expect(query({ ssId: 'source' })).rejects.toThrow('ACCOUNT_REQUIRED')
    expect(read).not.toHaveBeenCalled()
  } finally {
    db.close()
  }
})
