// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

/** Exercise retained local decisions, source payloads and immutable guards through real migrations. */
it('migrates populated lifecycle evidence without retaining legacy schema names or changing source data', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY);
    INSERT INTO organisation VALUES ('p'),('other');
    CREATE TABLE project(id TEXT PRIMARY KEY, modifiedAt TEXT DEFAULT 'original',
      organisationId TEXT, code TEXT, capabilities TEXT, markerStyleCode TEXT,
      cardStyleCode TEXT, useAllInOrgContext INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT, isDraft INTEGER DEFAULT 0, modifiedAt TEXT DEFAULT 'original', geometry TEXT, addressMeta TEXT, isIntangible INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,displayAddress TEXT);
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT,scope TEXT,hubId TEXT,audience TEXT NOT NULL DEFAULT 'public');
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT,valueJson TEXT);
    CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT);
    CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT);
    INSERT INTO project(id,organisationId) VALUES ('p','p'), ('other','other');
    INSERT INTO feature(id,projectId) VALUES ('f','p');`)
    db.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
    db.exec(readFileSync('migrations/0110_feature_place_history.sql', 'utf8'))
    db.exec(readFileSync('migrations/0112_feature_place_detachment.sql', 'utf8'))
    db.exec(readFileSync('migrations/0113_place_adoption_review.sql', 'utf8'))
    db.exec(readFileSync('migrations/0116_place_identity_history.sql', 'utf8'))
    db.exec(readFileSync('migrations/0117_place_identity_review.sql', 'utf8'))
    db.exec(readFileSync('migrations/0118_place_merge_redirect.sql', 'utf8'))
    db.exec(readFileSync('migrations/0120_place_identity_rejection.sql', 'utf8'))
    db.exec(readFileSync('migrations/0123_place_owned_fields.sql', 'utf8'))
    db.exec(readFileSync('migrations/0124_place_adoption_decisions.sql', 'utf8'))
    db.exec(readFileSync('migrations/0125_place_identity_consolidation.sql', 'utf8'))
    db.exec(readFileSync('migrations/0135_place_organisation_ownership.sql', 'utf8'))
    db.exec(readFileSync('migrations/0137_location_kinds.sql', 'utf8'))

    db.exec(readFileSync('migrations/0114_place_refresh.sql', 'utf8'))
    db.exec(readFileSync('migrations/0115_place_refresh_processing.sql', 'utf8'))
    db.exec(readFileSync('migrations/0119_place_source_changes.sql', 'utf8'))
    db.exec(readFileSync('migrations/0121_place_refresh_identity_scan.sql', 'utf8'))
    db.exec(readFileSync('migrations/0122_simplify_place_refresh.sql', 'utf8'))

    const rawPayload = JSON.stringify({
      resource: { type: 'places', placeId: 'publisher-id' },
      note: 'placeId is publisher evidence',
    })
    db.exec(
      "INSERT INTO place(id,ownerOrganisationId,state,kind) VALUES('p1','p','manual','establishment'),('p2','p','manual','establishment')",
    )
    for (const id of ['p1', 'p2'])
      db.prepare(
        'INSERT INTO placeRevision(id,placeId,sequence,origin,contentHash,payload,facts) VALUES(?,?,1,?,?,?,?)',
      ).run(id + 'r', id, 'local', 'hash-' + id, rawPayload, '{}')
    db.exec(
      "INSERT INTO featurePlace(featureId,placeId,factsRevisionId,locationRevisionId) VALUES('f','p1','p1r','p1r')",
    )
    const baseline = { placeId: 'p1', expectedState: 'manual', retained: 'unchanged' }
    const merge = {
      id: 'merge',
      identityReviewId: 'review',
      targetPlaceId: 'p1',
      sourcePlaceId: 'p2',
      targetBaseline: baseline,
      sourceBaseline: { ...baseline, placeId: 'p2' },
      sourceRevisionId: 'p2r',
      sourceFeatureToken: '[]',
      sourceFeatureCount: 0,
      actorId: 'test',
      createdAt: '2026-10-21',
    }
    db.prepare(
      'INSERT INTO placeIdentityReview(id,placeId,ownerOrganisationId,baseline,projection,actorId,mergeReviews) VALUES(?,?,?,?,?,?,?)',
    ).run(
      'review',
      'p1',
      'p',
      JSON.stringify(baseline),
      rawPayload,
      'test',
      JSON.stringify([merge]),
    )
    const redirect = {
      id: 'redirect',
      sourcePlaceId: 'p2',
      targetPlaceId: 'p1',
      sourceSsId: null,
      reviewId: 'merge',
      actorId: 'test',
      reason: 'Reviewed duplicate',
      createdAt: '2026-10-21',
    }
    db.prepare(
      "UPDATE place SET redirectTargetId='p1',redirect=?,state='redirect' WHERE id='p2'",
    ).run(JSON.stringify(redirect))
    db.exec("UPDATE project SET placePolicy='{\"version\":1}' WHERE id='p'")
    const beforeHistory = db.prepare('SELECT * FROM featurePlaceHistory').all()
    db.exec('BEGIN')
    db.exec(readFileSync('migrations/0138_location_storage.sql', 'utf8'))
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    db.exec('COMMIT')
    expect(db.prepare('PRAGMA integrity_check').get()).toMatchObject({
      integrity_check: 'ok',
    })
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_schema WHERE name LIKE '%place%' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
    ).toEqual([])
    expect(
      db.prepare('SELECT payload FROM locationRevision WHERE id=?').get('p1r'),
    ).toMatchObject({ payload: rawPayload })
    expect(
      db.prepare('SELECT locationId FROM featureLocation WHERE featureId=?').get('f'),
    ).toMatchObject({ locationId: 'p1' })
    const review = db.prepare('SELECT * FROM locationIdentityReview').get()!
    expect(review.projection).toBe(rawPayload)
    expect(JSON.parse(String(review.baseline))).toEqual({
      locationId: 'p1',
      expectedState: 'manual',
      retained: 'unchanged',
    })
    const migratedMerge = JSON.parse(String(review.mergeReviews))[0]
    expect(migratedMerge).toMatchObject({
      targetLocationId: 'p1',
      sourceLocationId: 'p2',
      targetBaseline: { locationId: 'p1' },
      sourceBaseline: { locationId: 'p2' },
    })
    expect(migratedMerge).not.toHaveProperty('sourcePlaceId')
    expect(
      JSON.parse(
        String(
          db.prepare("SELECT redirect FROM location WHERE id='p2'").get()!.redirect,
        ),
      ),
    ).toMatchObject({ sourceLocationId: 'p2', targetLocationId: 'p1' })
    expect(db.prepare('SELECT * FROM featureLocationHistory').all()).toEqual(
      beforeHistory.map(({ placeId, ...rest }) => ({ ...rest, locationId: placeId })),
    )
    expect(
      db.prepare("SELECT locationPolicy FROM project WHERE id='p'").get(),
    ).toMatchObject({ locationPolicy: '{"version":1}' })
    for (const table of [
      'location',
      'locationRevision',
      'featureLocationHistory',
      'locationAdoptionProposal',
      'locationIdentityHistory',
      'locationIdentityReview',
    ]) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all()
      expect(columns.at(-1)?.name).toBe('createdAt')
    }
    expect(() => db.exec("UPDATE locationRevision SET contentHash='changed'")).toThrow(
      'immutable',
    )
    expect(() => db.exec("UPDATE location SET state='manual' WHERE id='p2'")).toThrow(
      'immutable',
    )
  } finally {
    db.close()
  }
})
