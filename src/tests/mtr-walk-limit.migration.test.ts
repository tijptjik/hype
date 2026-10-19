// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { expect, it } from 'vitest'

it('clears only over-limit access, preserves evidence and jobs, and rejects stale writes', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE feature(id TEXT PRIMARY KEY,geometry TEXT,mtrStation TEXT,mtrExit TEXT,mtrDistance INTEGER,mtrResolution TEXT);
      CREATE TABLE featureMtrJob(featureId TEXT,lastError TEXT);
      INSERT INTO feature VALUES('far','original','station','exit',1001,'{"status":"ready","calculatedAt":"original","reviewed":true}'),
        ('boundary','original','station','exit',1000,'{"status":"ready"}'),
        ('empty','original',NULL,NULL,NULL,NULL);
      INSERT INTO featureMtrJob VALUES('far','preserve failure');`)
    const unchanged = db
      .prepare("SELECT * FROM feature WHERE id!='far' ORDER BY id")
      .all()
    db.exec(readFileSync('migrations/0105_enforce_mtr_walk_limit.sql', 'utf8'))
    const far = db.prepare("SELECT * FROM feature WHERE id='far'").get()!
    expect(far).toMatchObject({
      geometry: 'original',
      mtrStation: null,
      mtrExit: null,
      mtrDistance: null,
    })
    expect(JSON.parse(far.mtrResolution as string)).toMatchObject({
      status: 'unreachable',
      calculatedAt: 'original',
      reviewed: true,
      maxWalkingMetres: 1000,
      policyRejection: {
        previousDistance: 1001,
        previousStation: 'station',
        previousExit: 'exit',
      },
    })
    expect(
      db.prepare("SELECT * FROM feature WHERE id!='far' ORDER BY id").all(),
    ).toEqual(unchanged)
    expect(db.prepare('SELECT * FROM featureMtrJob').all()).toEqual([
      { featureId: 'far', lastError: 'preserve failure' },
    ])
    expect(() =>
      db.exec("UPDATE feature SET mtrDistance=1001 WHERE id='boundary'"),
    ).toThrow('exceeds 1000')
    expect(() =>
      db.exec("INSERT INTO feature(id,mtrDistance) VALUES('new',1001)"),
    ).toThrow('exceeds 1000')
    db.exec("UPDATE feature SET mtrDistance=1000 WHERE id='boundary'")
  } finally {
    db.close()
  }
})
