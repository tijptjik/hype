#!/usr/bin/env python3
"""Audit queryable translations and normalized Location content in an isolated rebuild."""
import json
import sqlite3
import sys
from pathlib import Path


def audit(path):
    """Inspect all user tables and validate the translation stores owned by this application."""
    db = sqlite3.connect('file:' + str(Path(path).resolve()) + '?mode=ro', uri=True)
    try:
        tables = [r[0] for r in db.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name NOT GLOB '*Fts*' ORDER BY name")]
        inventory = {}
        for table in tables:
            columns = list(db.execute('PRAGMA table_info("' + table.replace('"', '""') + '")'))
            inventory[table] = {'columns': [r[1] for r in columns]}
            if table.endswith('I18n'):
                if 'locale' not in inventory[table]['columns']:
                    raise RuntimeError(table + ' lacks a locale column')
                unique_locale = any(r[1] == 'locale' and r[5] > 0 for r in columns)
                for index in db.execute('PRAGMA index_list("' + table.replace('"', '""') + '")'):
                    if index[2] and any(r[2] == 'locale' for r in db.execute('PRAGMA index_info("' + index[1].replace('"', '""') + '")')):
                        unique_locale = True
                if not unique_locale:
                    raise RuntimeError(table + ' lacks a unique locale identity')
                inventory[table]['storage'] = 'translation-table'
        pairs = {'hub': 'hubI18n', 'organisation': 'organisationI18n', 'project': 'projectI18n', 'layer': 'layerI18n', 'feature': 'featureI18n', 'property': 'propertyI18n', 'propertyValue': 'propertyValueI18n', 'division': 'divisionI18n', 'locationRevision': 'locationRevisionI18n', 'identityCatalogue': 'identityCatalogueI18n'}
        for owner, translation in pairs.items():
            if owner in inventory and translation not in inventory:
                raise RuntimeError(owner + ' lacks its required translation table')
            if owner in inventory:
                inventory[owner]['translations'] = translation
        invalid = db.execute("SELECT count(*) FROM locationRevision WHERE json_type(facts,'$.i18n') IS NOT 'object' OR json_type(facts,'$.common.names') IS NOT NULL OR json_type(facts,'$.details.branch') IS NOT NULL OR json_type(facts,'$.details.format') IS NOT NULL OR json_type(facts,'$.common.location.address.fallbackDisplay') IS NOT NULL OR json_type(facts,'$.common.location.address.displayOverrides') IS NOT NULL").fetchone()[0]
        if invalid:
            raise RuntimeError(str(invalid) + ' Location revisions have a noncanonical translation shape')
        mismatch = db.execute("SELECT count(*) FROM locationRevision r,json_each(r.facts,'$.i18n') t LEFT JOIN locationRevisionI18n i ON i.revisionId=r.id AND i.locale=t.key WHERE i.revisionId IS NULL OR i.name IS NOT json_extract(t.value,'$.name') OR i.branch IS NOT json_extract(t.value,'$.branch') OR i.format IS NOT json_extract(t.value,'$.format') OR i.displayAddress IS NOT json_extract(t.value,'$.displayAddress') OR i.displayAddressOverride IS NOT json_extract(t.value,'$.displayAddressOverride')").fetchone()[0]
        extra = db.execute("SELECT count(*) FROM locationRevisionI18n i JOIN locationRevision r ON r.id=i.revisionId WHERE NOT EXISTS(SELECT 1 FROM json_each(r.facts,'$.i18n') t WHERE t.key=i.locale)").fetchone()[0]
        if mismatch or extra:
            raise RuntimeError('Location translation projection differs from revision content')
        catalogue = db.execute("SELECT count(*) FROM identityCatalogue c JOIN identityCatalogueRevision r ON r.catalogueId=c.id AND r.version=c.version,json_each(r.content,'$.i18n') t LEFT JOIN identityCatalogueI18n i ON i.catalogueId=c.id AND i.locale=t.key WHERE i.catalogueId IS NULL OR i.name IS NOT json_extract(t.value,'$.name')").fetchone()[0]
        catalogue_extra = db.execute("SELECT count(*) FROM identityCatalogueI18n i JOIN identityCatalogue c ON c.id=i.catalogueId JOIN identityCatalogueRevision r ON r.catalogueId=c.id AND r.version=c.version WHERE NOT EXISTS(SELECT 1 FROM json_each(r.content,'$.i18n') t WHERE t.key=i.locale)").fetchone()[0]
        if catalogue or catalogue_extra:
            raise RuntimeError('Catalogue translation projection differs from selected content')
        return {'tablesInspected': len(tables), 'translationTables': [t for t in tables if t.endswith('I18n')], 'locationRevisions': db.execute('SELECT count(*) FROM locationRevision').fetchone()[0], 'locationTranslations': db.execute('SELECT count(*) FROM locationRevisionI18n').fetchone()[0], 'canonicalLocationContent': True, 'projectionMatches': True, 'inventory': inventory}
    finally:
        db.close()


if __name__ == '__main__':
    database, output = sys.argv[1:]
    result = audit(database)
    Path(output).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'inventory'}))
