"""Stable business scope for the private, post-lifecycle #194 release."""
import sqlite3
from pathlib import Path


def read_db(path):
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    return db


def initialize_scope(db):
    """Materialize scope once. Follow accepted and historical relationships in both directions as needed."""
    sets = {
        'features': 'SELECT featureId FROM breadlineImportFeature',
        'catalogue': """SELECT c.id FROM identityCatalogue c JOIN identityCatalogueRevisionContent r
            ON r.catalogueId=c.id AND r.version=c.version
            WHERE coalesce(json_extract(r.content,'$.code'),'') NOT GLOB 'identicon-check-*'""",
        'places': """SELECT locationId FROM locationCanonicalDraft WHERE sourceKey GLOB 'mtr-shop:*'
            OR sourceKey GLOB 'mtr-station:*' OR sourceKey GLOB 'landsd-mtr-unit:*'
            UNION SELECT locationId FROM locationIdentityReview
            UNION SELECT locationId FROM featureLocationHistory WHERE featureId IN selected_features
            UNION SELECT locationId FROM featureLocation WHERE featureId IN selected_features""",
        'maps': 'SELECT mapId FROM premisesMapUnit WHERE locationId IN selected_places UNION SELECT mapId FROM locationPremisesMap WHERE locationId IN selected_places',
        'templates': """SELECT templateId FROM featureDisplayTemplateOutput WHERE featureId IN selected_features
            UNION SELECT id FROM displayTemplate WHERE code IN ('breadline-donor','breadline-donor-generated')""",
        'layers': "SELECT DISTINCT f.layerId FROM feature f JOIN breadlineImportFeature b ON b.featureId=f.id WHERE b.sourceTable='donors'",
        'operators': 'SELECT operatorId FROM locationOperator WHERE locationId IN selected_places',
    }
    for name, query in sets.items():
        db.execute(f'CREATE TEMP TABLE selected_{name}(id TEXT PRIMARY KEY)')
        db.execute(f'INSERT INTO selected_{name} SELECT DISTINCT * FROM ({query}) WHERE 1 ON CONFLICT DO NOTHING')
    # A redirect and its earlier binding can reference an independently established Location.
    for query in [
        'SELECT redirectTargetId FROM location WHERE id IN selected_places',
        'SELECT id FROM location WHERE redirectTargetId IN selected_places',
        'SELECT establishmentLocationId FROM locationOccupancy WHERE containerLocationId IN selected_places',
        'SELECT containerLocationId FROM locationOccupancy WHERE establishmentLocationId IN selected_places',
        'SELECT parentLocationId FROM locationMembership WHERE childLocationId IN selected_places',
    ]:
        db.execute(f'INSERT OR IGNORE INTO selected_places SELECT * FROM ({query}) WHERE 1')
    db.executescript("""
      CREATE TEMP TABLE selected_addresses AS
        SELECT addressRevisionId AS id FROM locationAddress WHERE locationId IN selected_places
        UNION SELECT addressRevisionId FROM locationOccupancy WHERE establishmentLocationId IN selected_places
        UNION SELECT addressRevisionId FROM featureLocationHistory WHERE featureId IN selected_features;
      CREATE INDEX temp.selected_addresses_id ON selected_addresses(id);
      CREATE TEMP TABLE selected_changes AS SELECT changeSetId AS id FROM featureRevision WHERE featureId IN selected_features;
      CREATE INDEX temp.selected_changes_id ON selected_changes(id);
    """)


# The remaining indirect dependencies (users, administrative scopes, image revisions,
# property definitions, division IDs) belong to the preceding cutover groups.
FILTERS = {
    'identityCatalogue': 'id IN selected_catalogue',
    'identityCatalogueRevision': 'catalogueId IN selected_catalogue',
    'identityCatalogueI18n': 'catalogueId IN selected_catalogue',
    'identityCatalogueSource': 'catalogueId IN selected_catalogue',
    'operator': 'id IN selected_operators',
    'operatorI18n': 'operatorId IN selected_operators',
    'location': 'id IN selected_places',
    'locationRevision': 'locationId IN selected_places',
    'locationRevisionI18n': 'revisionId IN (SELECT id FROM locationRevision WHERE locationId IN selected_places)',
    'locationCanonicalDraft': 'locationId IN selected_places',
    'locationIdentityReview': 'locationId IN selected_places',
    'locationIdentityHistory': 'locationId IN selected_places',
    'address': 'id IN (SELECT addressId FROM addressRevision WHERE id IN selected_addresses)',
    'addressRevision': 'id IN selected_addresses',
    'locationMembership': 'childLocationId IN selected_places',
    'locationOccupancy': 'establishmentLocationId IN selected_places',
    'locationAddress': 'locationId IN selected_places',
    'locationSharedRevision': 'locationId IN selected_places',
    'locationCurationLockRevision': 'locationId IN selected_places',
    'organisationLocation': 'locationId IN selected_places',
    'locationOperator': 'locationId IN selected_places',
    'premisesMap': 'id IN selected_maps',
    'premisesMapPublication': 'mapId IN selected_maps',
    'premisesMapDraftRevision': 'mapId IN selected_maps',
    'premisesMapCorrection': 'mapId IN selected_maps',
    'premisesMapUnit': 'mapId IN selected_maps',
    'locationPremisesMap': 'locationId IN selected_places',
    'displayTemplate': 'id IN selected_templates',
    'displayTemplateRevision': 'templateId IN selected_templates',
    'featureIntentPolicyRevision': "scopeType='layer' AND scopeId IN selected_layers",
    'featureIntentPolicy': "scopeType='layer' AND scopeId IN selected_layers",
    'revisionChangeSet': 'id IN selected_changes',
    'featureRevision': 'featureId IN selected_features',
    'featureRevisionImage': 'featureRevisionId IN (SELECT id FROM featureRevision WHERE featureId IN selected_features)',
    'locationAdoptionProposal': 'featureId IN selected_features',
    'featureLocation': 'featureId IN selected_features',
    'featureLocationHistory': 'featureId IN selected_features',
    'featureLocationMembership': 'featureId IN selected_features',
    'featureProperty': 'featureId IN selected_features',
    'featurePropertyI18n': 'featureId IN selected_features',
    'featureDisplayTemplateOutput': 'featureId IN selected_features',
    'feature': 'id IN selected_features',
    'featureI18n': 'featureId IN selected_features',
}
# A binding may have both a link and unlink event with the same version. Preserve both.
NATURAL_KEYS = {'featureLocationHistory': ('featureId', 'version', 'action')}


def layout(db, table):
    info = db.execute(f'PRAGMA table_info("{table}")').fetchall()
    if not info:
        raise ValueError(f'Missing schema prerequisite {table}')
    cols = [row['name'] for row in info if not (table == 'featureLocationHistory' and row['name'] == 'id')]
    keys = NATURAL_KEYS.get(table) or tuple(r['name'] for r in sorted(info, key=lambda r: r['pk']) if r['pk'])
    if not keys:
        raise ValueError(f'No stable key for {table}')
    return cols, keys


def records(db, table):
    cols, keys = layout(db, table)
    result = {}
    for row in db.execute(f'SELECT {",".join(cols)} FROM "{table}" WHERE {FILTERS[table]}'):
        key = tuple(row[k] for k in keys)
        if key in result:
            raise ValueError(f'Ambiguous {table} key {key}')
        result[key] = dict(row)
    return result
