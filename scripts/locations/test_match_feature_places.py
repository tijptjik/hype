"""Identity evidence must remain distinct from automatic Place acceptance."""
import collections
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('matcher', Path(__file__).with_name('match-feature-places.py'))
matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matcher)


def fixture(shared=False):
    """Create same-name nearby branches with optionally shared customer-service numbers."""
    point = [114.17, 22.3]
    places = {'a': {'id': 'a', 'names': {'en': 'Shop'}, 'phones': ['23456789'],
                    'addresses': {'en': 'Shop 1, 12 Road'}, 'coordinates': point,
                    'basicCategory': 'shop', 'taxonomyPrimary': 'shop',
                    'address2dId': None, 'address3dUnitId': None}}
    if shared:
        places['other-branch'] = {**places['a'], 'id': 'other-branch', 'coordinates': [114.3, 22.4]}
    grid = collections.defaultdict(set)
    grid[(int(point[0]*400), int(point[1]*400))].add('a')
    names = {'shop': {'a'}}
    phones = {'23456789': {'a', 'other-branch'} if shared else {'a'}}
    plan = {'facts': {'names': {'en': 'Shop'}, 'phoneNumber': ['+852 2345 6789'],
                     'location': {'geometry': {'type': 'Point', 'coordinates': point},
                                  'address': {'fallbackDisplay': {'en': 'Shop 1, 12 Road'}}}}}
    return plan, (places, grid, names, phones)


class MatchEvidenceTest(unittest.TestCase):
    def test_shared_phone_and_exact_name_never_become_accepted_identity(self):
        plan, index = fixture(shared=True)
        result = matcher.candidates(plan, index)
        self.assertEqual(result['state'], 'review')
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'candidate')
        self.assertFalse(result['candidates'][0]['evidence']['uniquePhoneInPublication'])

    def test_independent_contact_is_review_priority_not_auto_acceptance(self):
        plan, index = fixture()
        result = matcher.candidates(plan, index)
        self.assertEqual(result['state'], 'review')
        self.assertEqual(result['candidates'][0]['lookupQuery'], 'id:a')
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'corroborated')
        self.assertTrue(result['candidates'][0]['evidence']['exactFreeformAddress'])

    def test_nearby_different_name_is_not_corroborated(self):
        plan, index = fixture()
        plan['facts']['names'] = {'en': 'Another shop'}
        result = matcher.candidates(plan, index)
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'candidate')
        self.assertFalse(result['candidates'][0]['evidence']['exactLocalizedName'])

    def test_distant_exact_name_is_retained_for_coordinate_review(self):
        plan, index = fixture()
        plan['facts']['location']['geometry']['coordinates'] = [114.3, 22.4]
        result = matcher.candidates(plan, index)
        self.assertGreater(result['candidates'][0]['distanceMetres'], 250)
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'candidate')

    def test_nearby_only_candidates_do_not_block_unresolved_fallback(self):
        plan, index = fixture()
        plan['facts']['names'] = {'en': 'Unrelated'}
        plan['facts']['phoneNumber'] = []
        plan['facts']['location']['address']['fallbackDisplay'] = {}
        result = matcher.candidates(plan, index)
        self.assertEqual(result['state'], 'unresolved')
        self.assertEqual(result['reason'], 'nearby-only')
        self.assertEqual(len(result['candidates']), 1)

    def test_shared_contact_candidates_rank_ahead_of_nearby_only_businesses(self):
        plan, index = fixture(shared=True)
        plan['facts']['names'] = {'en': 'Shop - Branch'}
        plan['facts']['location']['address']['fallbackDisplay'] = {}
        places, grid, names, phones = index
        for n in range(6):
            pid = f'nearby-{n}'
            places[pid] = {**places['a'], 'id': pid, 'phones': [], 'names': {'en': f'Other {n}'}}
            grid[next(iter(grid))].add(pid)
        result = matcher.candidates(plan, index)
        self.assertEqual(result['candidates'][0]['id'], 'a')
        self.assertIn('other-branch', [row['id'] for row in result['candidates']])
        self.assertFalse(result['candidates'][0]['evidence']['uniquePhoneInPublication'])
        self.assertEqual(result['candidates'][0]['reviewPriority'], 'candidate')

    def test_non_point_geometry_remains_unresolved(self):
        plan, index = fixture()
        plan['facts']['location']['geometry']['type'] = 'Polygon'
        self.assertEqual(matcher.candidates(plan, index)['reason'], 'non-point-feature')

    def test_phone_evidence_does_not_extract_numbers_from_arbitrary_text(self):
        self.assertEqual(matcher.phone('+852 2345-6789'), '23456789')
        self.assertEqual(matcher.phone('00852 23456789'), '23456789')
        self.assertIsNone(matcher.phone('reference 23456789'))
        self.assertIsNone(matcher.phone('2345'))


if __name__ == '__main__':
    unittest.main()
