// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { expect, it } from 'vitest'

it('corrects only the reviewed address, preserving geometry, unrelated rows and subsequent edits', () => {
  const db = new DatabaseSync(':memory:')
  const migration = readFileSync(
    'migrations/0104_correct_nam_wan_bookshop_address.sql',
    'utf8',
  )
  try {
    db.exec(`CREATE TABLE feature(id TEXT, geometry TEXT, addressMeta TEXT, modifiedAt TEXT);
      CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,displayAddress TEXT,displayAddressGen INTEGER,addressProperties TEXT);`)
    const geometry = JSON.stringify({
      type: 'Point',
      coordinates: [114.03864, 22.28348],
    })
    const meta = JSON.stringify({
      geoAddressCode: '3782616278T20050430',
      rawLatitude: '22.28348',
      longitude: '114.19199',
    })
    const address = JSON.stringify({ rawAddress: '38C, Wing Hing Street, Ping Chau' })
    for (const id of ['HSENhLl6mUXX', 'unrelated']) {
      db.prepare('INSERT INTO feature VALUES (?,?,?,?)').run(
        id,
        geometry,
        meta,
        'before',
      )
      for (const locale of ['en', 'zh-hans', 'zh-hant'])
        db.prepare('INSERT INTO featureI18n VALUES (?,?,?,?,?,?)').run(
          id,
          locale,
          'Nam Wan Bookshop',
          locale === 'en'
            ? 'Wing Hing St Refuse Collection Point & Public Toilet, 15 Wing Hing St, Wan Chai'
            : '灣仔區永興街15號永興街垃圾收集站及公廁',
          1,
          address,
        )
    }
    const otherBefore = db
      .prepare("SELECT * FROM featureI18n WHERE featureId='unrelated'")
      .all()
    db.exec(migration)
    expect(
      db.prepare("SELECT geometry FROM feature WHERE id='HSENhLl6mUXX'").get(),
    ).toEqual({ geometry })
    expect(
      db
        .prepare(
          "SELECT displayAddress FROM featureI18n WHERE featureId='HSENhLl6mUXX' AND locale='en'",
        )
        .get(),
    ).toEqual({ displayAddress: '38C Wing Hing Street, Peng Chau' })
    expect(
      db.prepare("SELECT * FROM featureI18n WHERE featureId='unrelated'").all(),
    ).toEqual(otherBefore)
    expect(
      db.prepare("SELECT modifiedAt FROM feature WHERE id='unrelated'").get(),
    ).toEqual({ modifiedAt: 'before' })
    const corrected = db.prepare('SELECT * FROM featureI18n').all()
    db.exec(migration)
    expect(db.prepare('SELECT * FROM featureI18n').all()).toEqual(corrected)
    db.exec(
      "UPDATE featureI18n SET displayAddress='Independent correction' WHERE featureId='HSENhLl6mUXX' AND locale='en'",
    )
    db.exec(migration)
    expect(
      db
        .prepare(
          "SELECT displayAddress FROM featureI18n WHERE featureId='HSENhLl6mUXX' AND locale='en'",
        )
        .get(),
    ).toEqual({ displayAddress: 'Independent correction' })
  } finally {
    db.close()
  }
})
