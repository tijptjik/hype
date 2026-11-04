# Organisation role and form persistence

Tracking: [account support #189](https://github.com/tijptjik/hype/issues/189) and
[user import #194](https://github.com/tijptjik/hype/issues/194). This supplements the
[user import design](02-user-import.md).

## Organisation role provenance

Migration `0168_organisation_users.sql` stores independent organisation role grants and
derives the strongest surviving role with database triggers. Removing one source
preserves every remaining manual, project, or audience grant. Role response schemas
exclude the private grant map, and staff forms accept only member and owner assignments.

SQLite fixtures apply the production triggers to both legacy and schema-derived tables,
skipping only additive columns that already exist. The fixture creates import identity
tables before applying the migration and preserves the organisation role uniqueness
constraint.

## Organisation policy transaction

Optional organisation user-policy settings share the parent form transaction. The saved
email rule uses the current hub domain, and the write checks both the policy revision
and parent revision before any child mutation commits. Stale policy or parent revisions
return a conflict without changing any relation. Translation or policy write failures
roll back the entire form.
