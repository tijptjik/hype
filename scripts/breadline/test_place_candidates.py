"""Breadline discovery shares migration matching rules without changing import eligibility."""
import collections
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('breadline_candidates', Path(__file__).with_name('place-candidates.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BreadlineEvidenceTest(unittest.TestCase):
    def fixture(self):
        point = [114.17, 22.3]
        row = {'id': 1, 'longitude': point[0], 'latitude': point[1], 'name_en': 'Bakery - branch',
               'name_zh': None, 'phone': '+852 2345 6789', 'address_full_en': 'Shop 1, 12 Road',
               'address_full_zh': None, '_breadline_row_hash': 'source-hash'}
        shop = {'id': 'bakery', 'names': {'en': 'Bakery'}, 'phones': ['23456789'],
                'addresses': {'en': 'Shop 1, 12 Road'}, 'coordinates': point,
                'basicCategory': 'bakery', 'taxonomyPrimary': 'bakery',
                'address2dId': None, 'address3dUnitId': None}
        grid = collections.defaultdict(set)
        grid[(int(point[0]*400), int(point[1]*400))].add('bakery')
        index = ({'bakery': shop}, grid, {'bakery': {'bakery'}}, {'23456789': {'bakery'}})
        return row, index

    def test_contact_and_address_evidence_survive_branch_suffix(self):
        row, index = self.fixture()
        result = module.candidate_record(row, 'donors', index, {})
        self.assertEqual(result['state'], 'review')
        self.assertEqual(result['sourceHash'], 'source-hash')
        evidence = result['candidates'][0]['evidence']
        self.assertEqual(evidence['matchedPhoneCount'], 1)
        self.assertTrue(evidence['uniquePhoneInPublication'])
        self.assertTrue(evidence['exactFreeformAddress'])
        self.assertFalse(evidence['exactLocalizedName'])
        self.assertNotIn('phone', result)

    def test_phone_discovery_can_find_coordinate_errors_beyond_search_radius(self):
        row, index = self.fixture()
        row['longitude'] = 114.5
        result = module.candidate_record(row, 'donors', index, {})
        self.assertEqual(result['candidateCount'], 1)
        self.assertGreater(result['candidates'][0]['distanceMetres'], 250)
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'candidate')

    def test_dropoffs_have_no_invented_contact_evidence(self):
        row, index = self.fixture()
        del row['phone']
        row['address_full_en'] = 'Another address'
        result = module.candidate_record(row, 'dropoffs', index, {})
        self.assertEqual(result['phoneEvidence'], 'absent')
        self.assertEqual(result['state'], 'unresolved')
        self.assertEqual(result['reason'], 'nearby-only')

    def test_invalid_contact_and_stale_coordinate_correction_are_explicit(self):
        row, index = self.fixture()
        row['phone'] = 'call reference 23456789'
        result = module.candidate_record(row, 'donors', index, {})
        self.assertEqual(result['phoneEvidence'], 'unusable')
        self.assertEqual(result['candidates'][0]['evidence']['matchedPhoneCount'], 0)
        with self.assertRaisesRegex(ValueError, 'Reviewed coordinates changed'):
            module.candidate_record(row, 'donors', index, {'1': {'original': [0, 0], 'corrected': [114.17, 22.3]}})


if __name__ == '__main__':
    unittest.main()
