#!/usr/bin/env python3
"""Read-only local capture inventory. Refs #194, #88; never infers historical gallery order."""
import argparse
import hashlib
import json
import pathlib
import sqlite3
from collections import Counter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--database', required=True, type=pathlib.Path)
parser.add_argument('--out', required=True, type=pathlib.Path)
args = parser.parse_args()
if not args.database.is_file():
    parser.error('Database does not exist')
args.out.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('BEGIN')
# Resolve persisted Organisation/Project pairs and exact layer identities; include historic rows.
identities = [('cityrecorder', 'neon'), ('hkghostsigns', 'hkghostsigns'), ('eunic', 'eln'),
              ('cmef', 'independentBookstores'), ('hkfoodworks', 'breadline')]
projects = []
layers = []
for org_code, project_code in identities:
    rows = db.execute('SELECT p.*, o.code AS organisationCode FROM project p JOIN organisation o ON o.id=p.organisationId WHERE o.code=? AND p.code=?', (org_code, project_code)).fetchall()
    if len(rows) != 1:
        raise RuntimeError(f'Ambiguous or missing persisted identity: {org_code}/{project_code}')
    project = dict(rows[0]); projects.append(project)
    project_layers = [dict(r) for r in db.execute("SELECT l.*, t.name AS englishName FROM layer l LEFT JOIN layerI18n t ON t.layerId=l.id AND t.locale='en' WHERE l.projectId=? AND l.organisationId=?", (project['id'], project['organisationId']))]
    if project_code == 'breadline':
        project_layers = [l for l in project_layers if l['englishName'] == 'Donors']
        if len(project_layers) != 1:
            raise RuntimeError('Breadline donor layer is ambiguous; dropoffs are not donors')
    layers.extend(project_layers)
intent_order = ['canonical', 'closeUp', 'context', 'general', 'undefined', 'research']
snapshots = []
features = []
image_ids = set()
for layer in layers:
    for feature in db.execute('SELECT * FROM feature WHERE layerId=? AND projectId=? AND organisationId=?', (layer['id'], layer['projectId'], layer['organisationId'])):
        feature = dict(feature); features.append(feature)
        images = []
        for row in db.execute('SELECT i.*, fi.intent, fi.isPublished AS associationPublished, fi.localIsPublished AS associationLocalPublished FROM featureImage fi JOIN image i ON i.id=fi.imageId WHERE fi.featureId=?', (feature['id'],)):
            row = dict(row); image_ids.add(row['id'])
            images.append(row)
        # This is diagnostic current public ordering only. Ties are unresolved, never resolved by ID.
        images.sort(key=lambda i: i['createdAt'], reverse=True)
        images.sort(key=lambda i: intent_order.index(i['intent']) if i['intent'] in intent_order else -1)
        ordered = [i['id'] for i in images]
        location = db.execute('SELECT locationId FROM featureLocation WHERE featureId=?', (feature['id'],)).fetchone()
        for locale in db.execute('SELECT * FROM featureI18n WHERE featureId=? ORDER BY locale', (feature['id'],)):
            snapshots.append({
                'featureId': feature['id'], 'locationId': location['locationId'] if location else None,
                'locale': locale['locale'],
                'revision': json.dumps({'modifiedAt': feature['modifiedAt'], 'formWriteToken': feature.get('formWriteToken'), 'descriptionGen': locale['descriptionGen']}, sort_keys=True, separators=(',', ':')),
                'description': locale['description'], 'isArchived': bool(feature['isArchived'] or feature.get('localIsArchived')),
                'isDraft': bool(feature['isDraft']), 'orderedImageIds': ordered,
                'historicalOrderVerified': False, 'orderEvidence': None,
                'images': [{'id': i['id'], 'publicId': i['publicId'], 'env': i['env'], 'version': i['version'],
                            'contentHash': i['contentHash'], 'associatedFeatureIds': [r[0] for r in db.execute('SELECT featureId FROM featureImage WHERE imageId=? ORDER BY featureId', (i['id'],))], 'isArchived': bool(i['isArchived'] or i.get('localIsArchived')),
                            'isPublished': bool(i['associationPublished'] if i['associationLocalPublished'] is None else i['associationLocalPublished']), 'metadata': None} for i in images],
            })
# Full association inventory includes out-of-scope uses; shared images require global reconciliation.
associations = [dict(r) for r in db.execute('SELECT fi.*, i.publicId, i.env, i.version, i.contentHash, i.isArchived, i.createdAt, i.modifiedAt FROM featureImage fi JOIN image i ON i.id=fi.imageId') if r['imageId'] in image_ids]
summary = {'environment': 'explicit-local-sqlite-read-only', 'database': str(args.database.resolve()),
           'projects': [{'id': p['id'], 'organisationId': p['organisationId'], 'code': p['code']} for p in projects],
           'layers': [{'id': l['id'], 'projectId': l['projectId'], 'name': l['englishName'], 'isArchived': l['isArchived']} for l in layers],
           'foreignKeyViolationCount': len(db.execute('PRAGMA foreign_key_check').fetchall()),
           'counts': {'features': len(features), 'descriptionLocales': len(snapshots), 'images': len(image_ids),
                      'associationsIncludingOutsideScope': len(associations),
                      'locales': dict(Counter(s['locale'] for s in snapshots)),
                      'featuresByProject': dict(Counter(f['projectId'] for f in features))},
           'blockers': ['Historical gallery order has not been evidenced.', 'R2 metadata documents have not been loaded from an explicitly reviewed exact image stage.', 'Out-of-scope shared-image descriptions need reconciliation before application.']}
for name, value in [('snapshots.json', snapshots), ('inventory.json', summary), ('associations.json', associations)]:
    (args.out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
summary['snapshotsSha256'] = hashlib.sha256((args.out / 'snapshots.json').read_bytes()).hexdigest()
(args.out / 'inventory.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
db.rollback()
db.close()
