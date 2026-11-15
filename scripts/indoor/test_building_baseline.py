"""Regression coverage for the government's offset-relative WFS counts."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('building_baseline', Path(__file__).with_name('collect-building-baseline.py'))
baseline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(baseline)


class PaginationCounts(unittest.TestCase):
    def test_accepts_global_and_remaining_count_responses(self):
        self.assertEqual(baseline.expected_total(None, 0, 12525), 12525)
        self.assertEqual(baseline.expected_total(12525, 10000, 2525), 12525)
        self.assertEqual(baseline.expected_total(12525, 10000, 12525), 12525)
        self.assertEqual(baseline.expected_total(None, 0, 0), 0)

    def test_rejects_inconsistent_or_negative_counts(self):
        with self.assertRaises(ValueError):
            baseline.expected_total(12525, 10000, 2524)
        with self.assertRaises(ValueError):
            baseline.expected_total(None, 0, -1)


if __name__ == '__main__':
    unittest.main()
