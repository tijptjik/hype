// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { TaskReviewAction } from '#lib/enums.js'
import { reviewActions } from '#lib/api/services/taskReview.js'

it('retrofits legacy classified actions without changing task evidence and is idempotent', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE task(id TEXT PRIMARY KEY, reviewAction TEXT, reviewReason TEXT, modifiedAt TEXT);
      INSERT INTO task VALUES
        ('legacy', 'added-all-photos-with-intent', 'Original reason', 'original-time'),
        ('canonical', 'added-classified-photos', 'All Classified Photos', 'canonical-time'),
        ('all', 'added-all-photos', 'All photos', 'all-time'),
        ('pending', NULL, NULL, 'pending-time');`)
    const before = db.prepare('SELECT * FROM task ORDER BY id').all()
    const migration = readFileSync(
      'migrations/0202_normalize_classified_photo_review_action.sql',
      'utf8',
    )
    db.exec(migration)
    const expected = before.map(row => ({
      ...row,
      reviewAction:
        row.reviewAction === 'added-all-photos-with-intent'
          ? 'added-classified-photos'
          : row.reviewAction,
    }))
    expect(db.prepare('SELECT * FROM task ORDER BY id').all()).toEqual(expected)
    db.exec(migration)
    expect(db.prepare('SELECT * FROM task ORDER BY id').all()).toEqual(expected)
    expect(reviewActions).toEqual(Object.values(TaskReviewAction))
    expect(
      reviewActions.filter(action => action === 'added-classified-photos'),
    ).toHaveLength(1)
    expect(reviewActions).not.toContain('added-all-photos-with-intent')
  } finally {
    db.close()
  }
})
