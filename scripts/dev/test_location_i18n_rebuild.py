"""Pre-release migration adapters preserve evidence while normalizing authored snapshots."""
import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('rebuild', Path(__file__).with_name('rebuild-database.py'))
rebuild = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rebuild)


class LocationI18nMigrationTest(unittest.TestCase):
    def test_only_normalized_facts_literal_is_converted(self):
        facts = {'schemaVersion': 1, 'kind': 'establishment', 'common': {
            'names': {'en': "Baker's"}, 'location': {'address': {
                'fallbackDisplay': {'en': 'Central'}, 'rawSource': {'names': {'en': 'Keep raw'}}}}},
            'details': {'branch': {'en': 'Central'}, 'branchId': '0012',
                        'brands': [{'identifiers': {}, 'names': {'en': 'Brand'}}]}}
        literal = "'" + json.dumps(facts).replace("'", "''") + "'"
        result = rebuild.local_migration_sql(None, '0207_former_bookstore_occupancy.sql', literal)
        parsed = json.loads(result[1:-1].replace("''", "'"))
        self.assertEqual(parsed['i18n']['en'], {'name': "Baker's", 'branch': 'Central', 'displayAddress': 'Central'})
        self.assertEqual(parsed['common']['location']['address']['rawSource'], facts['common']['location']['address']['rawSource'])
        self.assertEqual(parsed['details']['branchId'], '0012')
        self.assertEqual(parsed['details']['brands'][0]['i18n'], {'en': {'name': 'Brand'}})
        self.assertEqual(rebuild.local_migration_sql(None, '0207_former_bookstore_occupancy.sql', result), result)

    def test_source_payload_is_not_rewritten(self):
        source = "'{\"names\":{\"en\":\"Publisher spelling\"}}'"
        self.assertEqual(rebuild.local_migration_sql(None, '0207_former_bookstore_occupancy.sql', source), source)


if __name__ == '__main__':
    unittest.main()
