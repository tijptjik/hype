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
