// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { systemTask } from '../lib/db/schema/systemTask'
import { eq, and } from 'drizzle-orm'

it('stores map issues without feature ancestry and filters the same reviewed/result counts', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES ('admin');",
    )
    db.exec(readFileSync('migrations/0258_system_task.sql', 'utf8'))
    db.exec(
      `INSERT INTO systemTask(id,resource,resourceId,type,title,message,createdAt,modifiedAt) VALUES ('issue','premisesMap','map','missing','Missing polygon','Review source identity','now','now');`,
    )
    const query = drizzle({} as never)
      .select()
      .from(systemTask)
      .where(
        and(eq(systemTask.resource, 'premisesMap'), eq(systemTask.isReviewed, false)),
      )
      .toSQL()
    expect(db.prepare(query.sql).all(...(query.params as never[]))).toHaveLength(1)
    db.exec(
      "UPDATE systemTask SET isReviewed=1,reviewOutcome='accepted',reviewerId='admin' WHERE id='issue'",
    )
    expect(db.prepare(query.sql).all(...(query.params as never[]))).toHaveLength(0)
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM systemTask WHERE isReviewed=1 AND reviewOutcome='accepted'",
        )
        .get()?.n,
    ).toBe(1)
    expect(() => db.exec("UPDATE systemTask SET reviewerId='missing'")).toThrow()
  } finally {
    db.close()
  }
})
