"""Rehearse ELN migrations on an in-memory copy of a supplied database."""
import argparse
import json
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
TABLES = ['feature', 'featureI18n', 'featureProperty', 'featurePropertyI18n', 'layerProperty', 'property', 'propertyI18n', 'projectProperty', 'image', 'featureImage', 'featureSpatial', 'layerI18n', 'project', 'layer', 'mapStyles', 'mapStyleI18n', 'projectMapStyles']


def snapshot(db):
    """Return canonical table contents for repeatability checks."""
    return {t: sorted(db.execute(f'SELECT * FROM "{t}"').fetchall(), key=repr) for t in TABLES}


def main():
    """Check foreign keys, preservation, maps, repeatability and target guards."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database',type=Path,required=True)
    parser.add_argument('--images',type=Path)
    args=parser.parse_args()
    source=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True)
    db=sqlite3.connect(':memory:')
    source.backup(db);source.close()
    db.execute('PRAGMA foreign_keys=ON')
    baseline_fk=db.execute('PRAGMA foreign_key_check').fetchall()
    before=snapshot(db)
    sql=(ROOT/'migrations/0127_eln_sourced_backfill.sql').read_text()
    sql+='\n'+(ROOT/'migrations/0130_eln_card_fields.sql').read_text()
    if args.images:sql+='\n'+args.images.read_text()
    db.executescript('BEGIN;'+sql+'COMMIT;')
    after=snapshot(db)
    db.executescript('BEGIN;'+sql+'COMMIT;')
    assert snapshot(db)==after, 'Second application changed data'
    assert db.execute('PRAGMA foreign_key_check').fetchall()==baseline_fk
    assert db.execute("SELECT count(*) FROM feature WHERE layerId='zJJawV9ay56p' AND id LIKE 'eln2027%' AND isPublished=0").fetchone()[0]==11
    assert db.execute("SELECT count(*) FROM featureSpatial WHERE featureId LIKE 'eln2027%'").fetchone()[0]==143
    assert db.execute("SELECT count(*) FROM featureSpatial WHERE featureId='eln2025Book013'").fetchone()[0]==13
    assert db.execute("SELECT count(*) FROM feature WHERE layerId='0bf1RYWdpaAt' AND id LIKE 'eln2025Book%'").fetchone()[0]==13
    assert db.execute("SELECT count(*) FROM (SELECT layerId,propertyId,count(*) n FROM layerProperty GROUP BY layerId,propertyId HAVING n>1)").fetchone()[0]==0
    # Removed catalogue entries stay absent, while ISBN values survive privately.
    assert db.execute("SELECT count(*) FROM property WHERE id IN ('eln_sources','eln_publisher','eln_translator')").fetchone()[0]==0
    assert db.execute("SELECT count(*) FROM layerProperty WHERE propertyId='eln_isbn' AND (isVisible<>0 OR isUserContributable<>0)").fetchone()[0]==0
    isbn_before=[r for r in before['featureProperty'] if r[1]=='eln_isbn']
    assert all(r in after['featureProperty'] for r in isbn_before), 'ISBN values changed'
    books=json.loads((ROOT/'scripts/eln/data/backfill.json').read_text())['books']
    for book in books:
        fid=book['id']
        assert db.execute("SELECT length(description)>0 FROM featureI18n WHERE featureId=? AND locale='en'",(fid,)).fetchone()[0]
        for pid in ['ZkXV20T2Bsa7','w7L3$qPA41ij']:
            assert db.execute("SELECT length(value)>0 FROM featurePropertyI18n WHERE featureId=? AND propertyId=? AND locale='en'",(fid,pid)).fetchone()[0]
        if args.images:
            assert db.execute("SELECT count(*) FROM featureImage WHERE featureId=? AND intent='canonical'",(fid,)).fetchone()[0]==1
    # Only the explicitly requested publication fields may change on existing features.
    columns=[r[1] for r in db.execute('PRAGMA table_info(feature)')]
    preserved=[i for i,col in enumerate(columns) if col not in {'isPublished','localIsPublished','publishedAt','publisherId'}]
    original={r[0]:tuple(r[i] for i in preserved) for r in before['feature']}
    assert all(original[r[0]]==tuple(r[i] for i in preserved) for r in after['feature'] if r[0] in original)
    assert db.execute("SELECT isPublished,markerStyleCode FROM project WHERE id='vGBvWfSZNELM'").fetchone()==(1,'flag')
    assert db.execute("SELECT count(*) FROM layer WHERE projectId='vGBvWfSZNELM' AND isPublished=1 AND json_extract(metadata,'$.mapStyleCode')='noclit25' AND json_extract(metadata,'$.markerStyleCode')='flag'").fetchone()[0]==3
    assert db.execute("SELECT isPublished FROM layer WHERE id='zJJawV9ay56p'").fetchone()[0]==0
    # Check a curated non-empty value survives a replay.
    db.execute("UPDATE featurePropertyI18n SET value='EDITORIAL SENTINEL' WHERE featureId='eln2024Spot001' AND propertyId='w7L3$qPA41ij' AND locale='en'")
    db.commit();db.executescript('BEGIN;'+sql+'COMMIT;')
    assert db.execute("SELECT value FROM featurePropertyI18n WHERE featureId='eln2024Spot001' AND propertyId='w7L3$qPA41ij' AND locale='en'").fetchone()[0]=='EDITORIAL SENTINEL'
    # Wrong target identity must fail before changes can be committed.
    db.execute("UPDATE feature SET layerId='lvWu_dCwiVZt' WHERE id='elnBook00004'")
    db.commit()
    try:
        db.executescript('BEGIN;'+sql+'COMMIT;')
    except sqlite3.IntegrityError:
        db.rollback()
    else:
        raise AssertionError('Wrong target passed the migration guard')
    print(json.dumps({'booksEnriched':len(books),'newDrafts':11,'newSpatialRows':143,'idempotent':True,'preservesExistingFeatures':True,'foreignKeyRegressions':0,'identityGuard':True,'coverLinksChecked':bool(args.images)},indent=2))


if __name__=='__main__':
    main()
