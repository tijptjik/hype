"""Check identity and containment invariants in the MTR onboarding review plan."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('onboarding', Path(__file__).with_name('plan-mtr-onboarding.py'))
onboarding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(onboarding)


class OnboardingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.plan = onboarding.build_plan()

    def test_every_unit_has_one_existing_station_parent(self):
        parents = {p['ref'] for p in self.plan['premises']}
        units = {u['ref'] for u in self.plan['units']}
        memberships = self.plan['memberships']
        self.assertEqual(len(memberships), len(units))
        self.assertEqual({m['childRef'] for m in memberships}, units)
        self.assertTrue(all(m['parentRef'] in parents for m in memberships))

    def test_combined_codes_remain_one_physical_unit(self):
        for name in ['HOK 43-44', 'HOK 3a & 3b']:
            units = [u for u in self.plan['units'] if u['names'].get('en') == name]
            self.assertEqual(len(units), 1)
            self.assertEqual(units[0]['ref'], 'landsd-mtr-unit:' + units[0]['sourceUnitId'])

    def test_levels_are_not_collapsed_into_paid_unpaid_sections(self):
        units = self.plan['units']
        self.assertGreater(len({u['floor']['sourceId'] for u in units}), 2)
        self.assertEqual({u['section']['names']['en'] for u in units}, {'Paid area', 'Unpaid area'})
        self.assertTrue(any(u['floor']['shortName'] == 'C' for u in units))

    def test_occupants_remain_unmatched_evidence(self):
        self.assertEqual(len(self.plan['occupantEvidence']), 93)
        self.assertTrue(all(o['establishmentLocationId'] is None for o in self.plan['occupantEvidence']))
        self.assertTrue(all(o['status'] == 'needs-identity-review' for o in self.plan['occupantEvidence']))

    def test_audit_separates_placeholders_shared_areas_and_identity(self):
        occupants = self.plan['occupantEvidence']
        count = lambda reason: sum(reason in o['review']['reasons'] for o in occupants)
        self.assertEqual(count('code-only-or-unnamed'), 7)
        self.assertEqual(count('shared-area-not-exclusive-shop-unit'), 7)
        self.assertEqual(count('repeated-name-distinct-source-records'), 4)
        self.assertEqual(count('point-outside-referenced-unit'), 0)

    def test_point_inside_hole_is_not_inside_unit(self):
        geometry = {'type': 'Polygon', 'coordinates': [[[0,0],[4,0],[4,4],[0,4],[0,0]], [[1,1],[3,1],[3,3],[1,3],[1,1]]]}
        self.assertFalse(onboarding.contains_point(geometry, [2,2]))
        self.assertTrue(onboarding.contains_point(geometry, [0.5,0.5]))

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaises(ValueError):
            onboarding.indexed([{'properties': {'unit_id': 'a'}}] * 2, 'unit_id')

    def test_snapshot_tampering_is_rejected(self):
        source = onboarding.ROOT / 'static/indoor/kennedy-town'
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            (directory / 'manifest.json').write_bytes((source / 'manifest.json').read_bytes())
            (directory / 'venue_polygon.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                onboarding.read_snapshot(directory)


if __name__ == '__main__':
    unittest.main()
