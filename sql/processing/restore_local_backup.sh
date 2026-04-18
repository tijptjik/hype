#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <ordered-backup.sql>" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

FILTERED_FILE="$(mktemp)"
RESTORE_FILE="$(mktemp)"
cleanup() {
  rm -f "$FILTERED_FILE"
  rm -f "$RESTORE_FILE"
}
trap cleanup EXIT

# Older ordered backups may include sqlite_sequence statements that fail on a
# fresh local D1 database before AUTOINCREMENT metadata exists.
grep -v -E '^(DELETE FROM sqlite_sequence;|INSERT INTO "sqlite_sequence")' \
  "$BACKUP_FILE" > "$FILTERED_FILE"

cat > "$RESTORE_FILE" <<EOF
PRAGMA foreign_keys = OFF;
PRAGMA defer_foreign_keys = ON;
EOF

cat "$FILTERED_FILE" >> "$RESTORE_FILE"

cat >> "$RESTORE_FILE" <<EOF
PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_keys = ON;
EOF

bunx wrangler d1 execute hype-db-local --file=sql/routines/reset_db.sql >/dev/null
bunx wrangler d1 execute hype-db-local --file="$RESTORE_FILE" >/dev/null

echo "✅ Restored local D1 from $BACKUP_FILE"
