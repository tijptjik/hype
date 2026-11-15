"""Rehearse operator migration and MTR title changes against an isolated local-state copy."""
import argparse
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile


def main():
    """Compare complete source/content snapshots and prove replay leaves them unchanged."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='mtr-operators-') as directory:
        target = Path(directory) / 'rehearsal.sqlite'
        source = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
        db = sqlite3.connect(target)
        source.backup(db)
        source.close()
        query = 'SELECT id,locationId,contentHash,rawSource,facts FROM locationRevisionContent ORDER BY id'
        before = db.execute(query).fetchall()
        identities = db.execute('SELECT * FROM location ORDER BY id').fetchall()
        foreign_keys = db.execute('PRAGMA foreign_key_check').fetchall()
        station_ids = {r[0] for r in db.execute("SELECT locationId FROM locationCanonicalDraft WHERE sourceKey LIKE 'mtr-station:%'")}
        command = ['bun', 'scripts/indoor/apply-mtr-operators.ts', str(target), 'hype-local-agent-admin']
        subprocess.run(command, check=True)
        subprocess.run(['bun', 'scripts/indoor/verify-mtr-operators.ts', str(target)], check=True)
        after = db.execute(query).fetchall()
        assert len(before) == len(after)
        changed = 0
        for old, new in zip(before, after):
            assert old[:2] == new[:2] and old[3] == new[3], 'Identity or source evidence changed'
            if old[1] not in station_ids:
                assert old == new, 'Non-station revision changed'
                continue
            original, current = json.loads(old[4]), json.loads(new[4])
            name = original['i18n']['en']['name']
            if not name.endswith(' MTR'):
                name += ' MTR'
            assert current['i18n']['en']['name'] == name
            current['i18n']['en']['name'] = original['i18n']['en']['name']
            assert original == current, 'Unrelated station facts changed'
            changed += old != new
        assert db.execute('SELECT * FROM location ORDER BY id').fetchall() == identities
        assert db.execute('PRAGMA foreign_key_check').fetchall() == foreign_keys
        links = db.execute('SELECT locationId FROM locationOperator WHERE operatorId=?', ('mtr-corporation',)).fetchall()
        assert {r[0] for r in links} == station_ids
        assert db.execute('SELECT count(*) FROM locationPremisesMap').fetchone()[0] == 2
        retained_maps = db.execute('SELECT * FROM locationPremisesMap ORDER BY locationId').fetchall()
        # Codes are unique within an operator, but can be reused by a different operating body.
        db.execute('SAVEPOINT code_constraints')
        try:
            db.execute("UPDATE locationOperator SET referenceCode='KET' WHERE referenceCode='HOK' AND operatorId='mtr-corporation'")
            raise AssertionError('Duplicate operator code was accepted')
        except sqlite3.IntegrityError:
            pass
        db.execute("INSERT INTO operator(id) VALUES ('rehearsal-other-operator')")
        db.execute("UPDATE locationOperator SET operatorId='rehearsal-other-operator',referenceCode='KET' WHERE referenceCode='HOK' AND operatorId='mtr-corporation'")
        db.execute('ROLLBACK TO code_constraints')
        db.execute('RELEASE code_constraints')
        retained_links = db.execute('SELECT * FROM locationOperator ORDER BY locationId').fetchall()
        subprocess.run(command, check=True)
        assert db.execute(query).fetchall() == after, 'Replay rewrote facts'
        assert db.execute('SELECT * FROM locationOperator ORDER BY locationId').fetchall() == retained_links
        assert db.execute('SELECT * FROM locationPremisesMap ORDER BY locationId').fetchall() == retained_maps
        print(f'PASS: {len(station_ids)} MTR stations linked, {changed} titles updated; other facts, source evidence, identities and foreign-key baseline retained; replay is idempotent')
        db.close()


if __name__ == '__main__':
    main()
