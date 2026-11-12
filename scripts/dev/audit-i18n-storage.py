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
        invalid = db.execute("SELECT count(*) FROM locationRevision WHERE json_type(facts,'$.i18n') IS NOT NULL OR json_type(facts,'$.common.names') IS NOT NULL OR json_type(facts,'$.details.branch') IS NOT NULL OR json_type(facts,'$.details.format') IS NOT NULL").fetchone()[0]
        catalogue = db.execute("SELECT count(*) FROM identityCatalogueRevision WHERE json_type(content,'$.i18n') IS NOT NULL").fetchone()[0]
        if invalid or catalogue:
            raise RuntimeError('Translated values duplicated in revision JSON')
        if db.execute('SELECT count(*) FROM locationRevisionWriteScope').fetchone()[0] or db.execute('SELECT count(*) FROM identityCatalogueWriteScope').fetchone()[0]:
            raise RuntimeError('Incomplete revision write scope')
        if db.execute('PRAGMA foreign_key_check').fetchone():
            raise RuntimeError('Translation or revision foreign-key violation')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database integrity failure')
        return {'tablesInspected': len(tables), 'translationTables': [t for t in tables if t.endswith('I18n')], 'locationRevisions': db.execute('SELECT count(*) FROM locationRevision').fetchone()[0], 'locationTranslations': db.execute('SELECT count(*) FROM locationRevisionI18n').fetchone()[0], 'canonicalLocationContent': True, 'singleTranslationStore': True, 'inventory': inventory}
    finally:
        db.close()


if __name__ == '__main__':
    database, output = sys.argv[1:]
    result = audit(database)
    Path(output).write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'inventory'}))
