// TESTS
import { expect, test } from 'bun:test'
// SQLITE
import { Database } from 'bun:sqlite'
// POLICY
import { prepareRevisionIdlePolicy } from './revision-idle-policy'

/** Minimal enrolled lifecycle schema for rehearsing the actual atomic upgrade statements. */
function fixture(): Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT);
    CREATE TABLE revisionEditWindow(resource TEXT NOT NULL,revisionId TEXT NOT NULL,actorId TEXT NOT NULL,origin TEXT NOT NULL,lastEditedAt INTEGER NOT NULL,closedAt INTEGER,PRIMARY KEY(resource,revisionId));
    INSERT INTO revisionEditWindow VALUES('feature','retained','alice','user',1,NULL);`)
  for (const r of ['organisation', 'project', 'layer', 'hub']) {
    db.exec(`CREATE TABLE ${r}Revision(id TEXT PRIMARY KEY,${r}Id TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT,schemaVersion INTEGER);
      CREATE TABLE ${r}RevisionHead(${r}Id TEXT,currentRevisionId TEXT,generation INTEGER);
      CREATE TABLE ${r}RevisionWrite(${r}Id TEXT,revisionId TEXT,token TEXT);
      CREATE TRIGGER ${r}_revision_immutable_update BEFORE UPDATE ON ${r}Revision BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
    if (r !== 'layer')
      db.exec(`CREATE TABLE ${r}RevisionLogo(revisionId TEXT,imageId TEXT,imageRevisionId TEXT);
      CREATE TRIGGER ${r}_revision_logo_no_delete BEFORE DELETE ON ${r}RevisionLogo BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
  }
  db.exec(`CREATE TABLE propertyCatalogRevision(id TEXT,scope TEXT,resourceId TEXT,previousRevisionId TEXT,changeSetId TEXT,content TEXT);
    CREATE TABLE propertyCatalogRevisionHead(scope TEXT,resourceId TEXT,currentRevisionId TEXT);
    CREATE TABLE propertyCatalogRevisionWrite(scope TEXT,resourceId TEXT,token TEXT);
    CREATE TRIGGER property_catalog_revision_update BEFORE UPDATE ON propertyCatalogRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE imageIntentPolicyRevision(id TEXT,scopeType TEXT,scopeId TEXT,actorId TEXT,createdAt TEXT,previous TEXT,current TEXT);
    CREATE TRIGGER image_intent_history_no_update BEFORE UPDATE ON imageIntentPolicyRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TABLE feature(id TEXT PRIMARY KEY,currentRevisionId TEXT,revisionVersion INTEGER);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT,previousRevisionId TEXT,mergedFromRevisionId TEXT,changeSetId TEXT,schemaVersion INTEGER,content TEXT,recordState TEXT,sequence INTEGER,legacyEvidence TEXT,baselineAttribution TEXT);
    INSERT INTO featureRevision(id,content) VALUES('retained','{}');
    CREATE TABLE featureRevisionWriteScope(featureId TEXT,token TEXT);
    CREATE TABLE featureRevisionProposal(id TEXT,baseRevisionId TEXT,kind TEXT,changes TEXT,status TEXT,version TEXT,contributorId TEXT);
    CREATE TABLE featureRevisionReview(id TEXT,featureId TEXT,proposalId TEXT,proposalVersion TEXT,changes TEXT,comparedRevisionId TEXT,resultingRevisionId TEXT,context TEXT,resolutions TEXT,action TEXT,changeSetId TEXT);
    CREATE TABLE featureRevisionImage(featureRevisionId TEXT,imageId TEXT,imageRevisionId TEXT,position INTEGER,intent TEXT);
    CREATE TABLE featureIdentityOperationMember(revisionId TEXT);
    CREATE TABLE featureUploadEvidence(proposalId TEXT,proposalVersion TEXT);
    CREATE TRIGGER feature_revision_no_update BEFORE UPDATE ON featureRevision BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER feature_review_no_update BEFORE UPDATE ON featureRevisionReview BEGIN SELECT RAISE(ABORT,'immutable'); END;
    CREATE TRIGGER featureRevisionImage_immutable_delete BEFORE DELETE ON featureRevisionImage BEGIN SELECT RAISE(ABORT,'immutable'); END;`)
  return db
}

test('upgrades converted storage atomically without compatibility heads or rewriting retained payloads', () => {
  const db = fixture()
  try {
    const groups = prepareRevisionIdlePolicy(db)
    expect(groups).toHaveLength(1)
    db.transaction(() => {
      for (const statement of groups[0].statements)
        db.query(statement.sql).run(...statement.params)
    })()
    expect(db.query('SELECT content FROM featureRevision').get()).toEqual({
      content: '{}',
    })
    expect(
      db
        .query("SELECT closedAt FROM revisionEditWindow WHERE revisionId='retained'")
        .get(),
    ).toMatchObject({ closedAt: expect.any(Number) })
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name='featureRevisionHead'").get(),
    ).toBeNull()
    expect(db.query('SELECT name FROM d1_migrations').all()).toEqual([
      { name: '0203_revision_edit_windows.sql' },
    ])
    expect(prepareRevisionIdlePolicy(db)).toEqual([])
  } finally {
    db.close()
  }
})
