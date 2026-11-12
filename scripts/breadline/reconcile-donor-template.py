"""Publish the approved expression on the original template and rebind donor revisions."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3

ORIGINAL = '2966d49c-fa7d-4902-97c9-9e7b94f9c75a'
GENERATED = 'breadline-donor-generated-v1'
CHANGE = 'breadline-donor-template-identity:v1'
LAYER = '1msQMcuqfHrP'


def literal(value):
    """Encode trusted snapshot values as SQLite literals."""
    if value is None:
        return 'NULL'
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return "'" + value.replace("'", "''") + "'"


def compile_sql(db):
    """Generate an attributed, snapshot-guarded correction without rewriting history."""
    original = db.execute('SELECT version,code FROM displayTemplate WHERE id=?', (ORIGINAL,)).fetchone()
    version = original[0] + 1
    source = db.execute('SELECT t.version,r.definition FROM displayTemplate t JOIN displayTemplateRevision r ON r.templateId=t.id AND r.version=t.version WHERE t.id=?', (GENERATED,)).fetchone()
    definition = json.loads(source[1])
    definition.update(name='Breadline Donor', code=original[1])
    policy = db.execute("SELECT definition,namingRules,version FROM featureIntentPolicy WHERE scopeType='layer' AND scopeId=?", (LAYER,)).fetchone()
    rules = json.loads(policy[1])
    reference = {'id': ORIGINAL, 'version': version}
    rules['place']['registry'] = reference
    donors = db.execute("SELECT id,currentRevisionId,revisionVersion FROM feature WHERE layerId=? AND json_extract(nameTemplate,'$.rule.registry.id')=? ORDER BY id", (LAYER, GENERATED)).fetchall()
    if len(donors) != 311:
        raise RuntimeError('Expected exactly 311 generated-template consumers')
    enabled = 'EXISTS(SELECT 1 FROM _donor_template_pending)'
    now = datetime.now(timezone.utc).isoformat()
    actor = 'hype-local-agent-admin'
    sql = ['PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;',
           f'CREATE TEMP TABLE _donor_template_pending AS SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM revisionChangeSet WHERE id={literal(CHANGE)});',
           'CREATE TEMP TABLE _donor_template_guard(ok INTEGER NOT NULL CHECK(ok=1));']

    def guard(predicate):
        sql.append(f'INSERT INTO _donor_template_guard SELECT CASE WHEN ({predicate}) THEN 1 ELSE 0 END WHERE {enabled};')

    guard(f'(SELECT version FROM displayTemplate WHERE id={literal(ORIGINAL)})={original[0]}')
    guard(f'(SELECT version FROM displayTemplate WHERE id={literal(GENERATED)})={source[0]}')
    guard(f"(SELECT version FROM featureIntentPolicy WHERE scopeType='layer' AND scopeId={literal(LAYER)})={policy[2]}")
    for feature, previous, sequence in donors:
        guard(f'EXISTS(SELECT 1 FROM feature WHERE id={literal(feature)} AND currentRevisionId={literal(previous)} AND revisionVersion={sequence})')
    sql.extend([
        f"INSERT INTO revisionChangeSet(id,actorId,origin,reason,createdAt) SELECT {literal(CHANGE)},{literal(actor)},'migration','Use the original Breadline Donor template identity',{literal(now)} WHERE {enabled};",
        f'INSERT INTO displayTemplateRevision(templateId,version,definition,actorId,createdAt) SELECT {literal(ORIGINAL)},{version},{literal(definition)},{literal(actor)},{literal(now)} WHERE {enabled};',
        f'UPDATE displayTemplate SET version={version} WHERE id={literal(ORIGINAL)} AND {enabled};',
        f"UPDATE featureIntentPolicy SET namingRules={literal(rules)},version=version+1,actorId={literal(actor)} WHERE scopeType='layer' AND scopeId={literal(LAYER)} AND {enabled};",
        f"INSERT INTO featureIntentPolicyRevision(id,scopeType,scopeId,definition,namingRules,version,actorId,createdAt) SELECT {literal(CHANGE+':policy')},'layer',{literal(LAYER)},{literal(policy[0])},{literal(rules)},{policy[2]+1},{literal(actor)},{literal(now)} WHERE {enabled};",
    ])
    for feature, previous, sequence in donors:
        revision = CHANGE + ':' + feature
        sql.extend([
            f'INSERT INTO featureRevisionWriteScope(featureId,token) SELECT {literal(feature)},{literal(CHANGE)} WHERE {enabled};',
            f"INSERT INTO featureRevision(id,featureId,previousRevisionId,changeSetId,schemaVersion,content,recordState,sequence) SELECT {literal(revision)},featureId,id,{literal(CHANGE)},schemaVersion,json_set(content,'$.profile.nameTemplate.rule.registry',json({literal(reference)})),recordState,{sequence+1} FROM featureRevision WHERE id={literal(previous)} AND {enabled};",
            f'INSERT INTO featureRevisionImage(featureRevisionId,imageId,imageRevisionId,position,intent) SELECT {literal(revision)},imageId,imageRevisionId,position,intent FROM featureRevisionImage WHERE featureRevisionId={literal(previous)} AND {enabled};',
            f'UPDATE featureDisplayTemplateOutput SET templateId={literal(ORIGINAL)},templateVersion={version} WHERE featureId={literal(feature)} AND {enabled};',
            f"UPDATE feature SET nameTemplate=json_set(nameTemplate,'$.rule.registry',json({literal(reference)})),currentRevisionId={literal(revision)},revisionVersion={sequence+1},modifiedAt={literal(now)} WHERE id={literal(feature)} AND {enabled};",
            f'DELETE FROM featureRevisionWriteScope WHERE featureId={literal(feature)} AND token={literal(CHANGE)} AND {enabled};',
        ])
    sql.append('DROP TABLE _donor_template_guard; DROP TABLE _donor_template_pending; COMMIT;')
    return '\n'.join(sql) + '\n', version


def verify(db, before, version):
    """Check titles are unchanged and every current consumer uses the original identity."""
    if db.execute('SELECT featureId,locale,title FROM featureI18n ORDER BY featureId,locale').fetchall() != before:
        raise RuntimeError('Template rebinding changed displayed names')
    count = db.execute("SELECT count(*) FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId WHERE f.layerId=? AND json_extract(f.nameTemplate,'$.rule.registry.id')=? AND json_extract(r.content,'$.profile.nameTemplate.rule.registry.id')=? AND json_extract(r.content,'$.profile.nameTemplate.rule.registry.version')=?", (LAYER, ORIGINAL, ORIGINAL, version)).fetchone()[0]
    if count != 311:
        raise RuntimeError('Incomplete consumer rebinding')
    if db.execute('PRAGMA foreign_key_check').fetchone() or db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        raise RuntimeError('Database integrity check failed')


def main():
    """Dry-run twice on a copy before an explicitly requested local application."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with closing(sqlite3.connect(f'{args.database.resolve().as_uri()}?mode=ro', uri=True)) as source, closing(sqlite3.connect(':memory:')) as trial:
        migration, version = compile_sql(source)
        source.backup(trial)
        before = trial.execute('SELECT featureId,locale,title FROM featureI18n ORDER BY featureId,locale').fetchall()
        trial.executescript(migration)
        verify(trial, before, version)
        trial.executescript(migration)
        verify(trial, before, version)
    args.output.write_text(migration)
    result = {'mode': 'dry-run', 'originalTemplate': ORIGINAL, 'version': version, 'donors': 311, 'titlesPreserved': True}
    if args.apply:
        backup = args.database.with_name(args.database.name + '.before-template-identity-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        with closing(sqlite3.connect(args.database)) as db, closing(sqlite3.connect(backup)) as saved:
            db.backup(saved)
            db.executescript(migration)
            verify(db, before, version)
        result.update(mode='applied', backup=str(backup))
    print(json.dumps(result))


if __name__ == '__main__':
    main()
