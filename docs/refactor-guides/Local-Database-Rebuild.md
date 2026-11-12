# Local database rebuild

Run from the Hype Git root:

```sh
bun run db:rebuild:guided --no-mocks
```

The guided command defaults to production/Breadline data without synthetic fixtures. It
calls the existing `db:rebuild:local` pipeline through `dev-check`. It exports
production read-only, migrates a private database, reconciles Breadline users, imports
Features, initializes verified revisions, applies dependent migrations and audits
translation storage, foreign keys and database integrity. It never pushes or deploys.
Local installation is a separate prompt and retains a backup of the old local database.

Prompts do not hold a validation slot. On failure, the command prints the private
receipt and log location, then offers retry, an approved recovery manifest, or stop.
Retry resumes after successful user reconciliation; an earlier failure reuses the
completed exports in a new preparation. It never marks a failed stage complete. An
active database writer blocks installation: stop the reported development server and
choose retry, then restart it after installation. The command does not kill unknown
servers or silently skip failed checks.

For automation, use the noninteractive command. Errors exit nonzero:

```sh
bun run db:rebuild:local --no-mocks
bun run db:rebuild:local --resume .local/dev-rebuilds/REBUILD_DIRECTORY
bun run db:rebuild:local --resume .local/dev-rebuilds/REBUILD_DIRECTORY --apply
```

Wrap database-dependent automation in `dev-check`. The guided command already does this.
Retained exports can be supplied with `--inputs PRIVATE_EXPORT_DIRECTORY`; the resume
path verifies the recorded source hashes. Logs and database exports stay under ignored
`.local` directories and must not be committed.

## Verified media recovery

Missing sidecars stop revision initialization. A recovery manifest is an explicit
approval to reuse previously verified recovery evidence for the listed Features:

```json
{
  "version": 1,
  "recoveries": [
    {
      "featureIds": ["FEATURE_ID"],
      "reason": "Approved reuse of the previously verified empty metadata recovery",
      "priorReceipt": "/absolute/private/path/media/receipt.json"
    }
  ]
}
```

Keep the manifest private. Supply its path at the guided prompt or pass
`--recovery-manifest PRIVATE_MANIFEST.json`. Each cohort must match its prior receipt in
membership, image identity, namespace, storage key, version, original-byte hash and
metadata hash. The recovery fetches and verifies the original bytes before reusing
evidence. Changed or missing evidence stops the rebuild; the command does not invent
metadata or accept a changed asset. The accepted manifest and enrollment receipts are
retained with the rebuild so the same operation can be repeated.

## Translation storage

`locationRevisionI18n` is the sole normalized store for translated Location labels.
`identityCatalogueI18n` owns catalogue names by revision. Parent JSON does not retain
copies. SQL content views reconstruct locale-first objects for application readers;
atomic insert triggers write the non-translated parent and its immutable locale rows.
The audit rejects duplicate translation namespaces in parent JSON and incomplete write
scopes. Raw publisher evidence is intentionally preserved unchanged.
