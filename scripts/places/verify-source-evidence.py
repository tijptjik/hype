#!/usr/bin/env python3
"""Verify retained publisher pages without mutating the database (Refs #194).

Usage: python scripts/places/verify-source-evidence.py DATABASE [--require-complete] [--summary SUMMARY_JSON]
Outputs counts and a SHA-256 receipt for each ordered comparison. No source payloads
or credentials are printed. This verifies retention, not canonical Place identity.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3


def verify(path: Path, require_complete: bool, summary_path: Path | None = None) -> dict:
    """Check cursor continuity, pins, page/identity counts and completion evidence."""
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    try:
        db.execute('BEGIN')
        if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise ValueError('Database integrity check failed')
        if db.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('Database foreign-key check failed')
        summary = json.loads(summary_path.read_text()) if summary_path else None
        summary_matches = 0
        receipts = []
        transitions = db.execute('SELECT id,phase,plan FROM placeSourceTransition ORDER BY id').fetchall()
        if require_complete and not transitions:
            raise ValueError('No publisher transitions retained')
        for transition in transitions:
            if require_complete and transition['phase'] != 'complete':
                raise ValueError('Publisher transition is not complete')
            comparisons = db.execute('SELECT * FROM placeSourceComparison WHERE transitionId=? ORDER BY id', (transition['id'],)).fetchall()
            if transition['phase'] == 'complete' and transition['plan'] is None:
                raise ValueError('Completed transition has no retained discovery plan')
            if transition['plan'] is not None:
                plan = json.loads(transition['plan'])
                if len(comparisons) != len(plan['comparisons']):
                    raise ValueError('Comparison inventory does not match retained plan')
                if transition['phase'] == 'complete' and plan['reviewRequired']:
                    raise ValueError('Completed transition still requires review')
            for comparison in comparisons:
                counts = dict(added=0, changed=0, removed=0)
                expected_cursor = None
                seen_ids = set()
                seen_cursors = set()
                digest = hashlib.sha256()
                pages = db.execute('SELECT * FROM placeSourcePage WHERE comparisonId=? ORDER BY pageNumber', (comparison['id'],)).fetchall()
                retained_pin = json.loads(comparison['pin']) if comparison['pin'] else None
                for index, row in enumerate(pages):
                    if row['pageNumber'] != index or row['requestCursor'] != (expected_cursor or ''):
                        raise ValueError('Broken retained page sequence')
                    if index and expected_cursor is None:
                        raise ValueError('Evidence continues after terminal page')
                    page = json.loads(row['evidence'])
                    if page['pin'] != retained_pin or page['nextCursor'] != row['nextCursor']:
                        raise ValueError('Retained page differs from checkpoint pin or cursor')
                    if page['pin']['datasetCode'] != comparison['datasetCode'] or page['pin']['resourceType'] != comparison['resourceType']:
                        raise ValueError('Evidence belongs to a different publisher')
                    if len(page['records']) > 100 or (page['nextCursor'] is not None and len(page['records']) != 100):
                        raise ValueError('Invalid bounded page length')
                    for record in page['records']:
                        identity = record['sourceRecordId']
                        if identity in seen_ids:
                            raise ValueError('Duplicate retained publisher identity')
                        seen_ids.add(identity)
                        counts[record['type']] += 1
                    indexed = {r[0] for r in db.execute('SELECT sourceRecordId FROM placeSourceEvidenceId WHERE comparisonId=? AND pageNumber=?', (comparison['id'], index))}
                    if indexed != {record['sourceRecordId'] for record in page['records']}:
                        raise ValueError('Identity index differs from retained evidence')
                    expected_cursor = page['nextCursor']
                    if expected_cursor is not None:
                        if expected_cursor in seen_cursors:
                            raise ValueError('Publisher cursor cycle')
                        seen_cursors.add(expected_cursor)
                    digest.update(row['evidence'].encode())
                    digest.update(b'\n')
                if comparison['pageNumber'] != len(pages) or any(comparison[key] != value for key, value in counts.items()):
                    raise ValueError('Checkpoint counts differ from retained evidence')
                terminal = bool(pages) and expected_cursor is None
                if bool(comparison['complete']) != terminal or comparison['cursor'] != expected_cursor:
                    raise ValueError('Checkpoint completion differs from retained evidence')
                if transition['phase'] == 'complete' and not terminal:
                    raise ValueError('Completed transition contains an incomplete comparison')
                if summary is not None and retained_pin == summary['pin']:
                    if not terminal or any(counts[key] != summary['summary'][key + '_count'] for key in counts):
                        raise ValueError('Evidence does not match complete API summary')
                    summary_matches += 1
                receipts.append(dict(comparisonId=comparison['id'], pages=len(pages), complete=terminal, counts=counts, evidenceSha256=digest.hexdigest()))
        if summary is not None and summary_matches != 1:
            raise ValueError('API summary must match exactly one retained comparison')
        return dict(transitions=len(transitions), comparisons=receipts, integrity='ok')
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--summary', type=Path, help='Independent source API summary response for this comparison')
    args = parser.parse_args()
    print(json.dumps(verify(args.database, args.require_complete, args.summary), indent=2))
