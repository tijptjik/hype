"""Verify the canonical-draft migration on an isolated full database copy (Refs #194)."""
import argparse
import sqlite3
import tempfile
from pathlib import Path


def main():
    """Keep live data read-only and verify all retained table counts, references and external schema."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    args = parser.parse_args()
    source = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
    with tempfile.TemporaryDirectory() as temporary:
        target = sqlite3.connect(str(Path(temporary) / 'rehearsal.sqlite'))
        source.backup(target)
        target.execute('PRAGMA foreign_keys=ON')
        tables = [r[0] for r in target.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        counts = {name: target.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] for name in tables}
        failures = target.execute('PRAGMA foreign_key_check').fetchall()
        external_query = "SELECT name,sql FROM sqlite_master WHERE type IN ('trigger','view') AND tbl_name!='location' AND name NOT LIKE 'location_canonical_draft_%' AND name NOT IN ('locationMembership_kinds','locationMembership_part_owner','locationRematchEligible') ORDER BY name"
        external = target.execute(external_query).fetchall()
        # No CASCADE children may be deleted during the parent-table rebuild.
        for name in tables:
            for reference in target.execute('PRAGMA foreign_key_list("' + name.replace('"', '""') + '")'):
                if reference[2] == 'location' and reference[6] not in ('RESTRICT', 'NO ACTION'):
                    raise AssertionError('Unsupported cascading Location reference: ' + name)
        target.executescript('BEGIN;' + Path('migrations/0250_location_canonical_drafts.sql').read_text() + Path('migrations/0251_location_draft_reconciliation.sql').read_text() + 'COMMIT;')
        for name, count in counts.items():
            assert target.execute('SELECT count(*) FROM "' + name.replace('"', '""') + '"').fetchone()[0] == count, name
        assert external == target.execute(external_query).fetchall()
        assert failures == target.execute('PRAGMA foreign_key_check').fetchall()
        target.execute("INSERT INTO location(id,kind,class,state) VALUES ('draft-migration-fixture','built','premises','unresolved')")
        target.execute("INSERT INTO locationCanonicalDraft(locationId,sourceKey,createdBy) VALUES ('draft-migration-fixture','test:source','test')")
        for state in ('manual', 'linked'):
            try:
                target.execute("INSERT INTO location(id,kind,class,state) VALUES (?, 'built','premises',?)", ('invalid-' + state, state))
            except sqlite3.IntegrityError:
                pass
            else:
                raise AssertionError('Invalid identity accepted: ' + state)
        print('PASS: retained all', len(tables), 'table counts, external schema and foreign-key baseline; shared drafts allowed; invalid private/published identities rejected')
        target.close()
    source.close()


if __name__ == '__main__':
    main()
