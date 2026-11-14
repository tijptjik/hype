"""Research sync must preserve divergent edits and never propagate deletions."""
import unittest
from sync import action


class SyncDecisions(unittest.TestCase):
    def test_local_deletion_restores_from_backup(self):
        self.assertEqual(action(None, 'original', 'original'), 'pull')

    def test_remote_deletion_restores_from_local(self):
        self.assertEqual(action('original', None, 'original'), 'push')

    def test_one_sided_changes_follow_the_changed_copy(self):
        self.assertEqual(action('new', 'original', 'original'), 'push')
        self.assertEqual(action('original', 'new', 'original'), 'pull')

    def test_simultaneous_changes_are_never_overwritten(self):
        self.assertEqual(action('local-edit', 'remote-edit', 'original'), 'conflict')
        self.assertEqual(action('local-edit', 'remote-edit', None), 'conflict')

    def test_identical_edits_converge_without_transfer(self):
        self.assertEqual(action('same-edit', 'same-edit', 'original'), 'equal')


if __name__ == '__main__':
    unittest.main()
