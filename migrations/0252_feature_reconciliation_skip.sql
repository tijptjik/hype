-- An explicit Feature review outcome, independent of any Location association.
-- Keep actor attribution even if the account is later removed.
ALTER TABLE feature ADD COLUMN reconciliationSkippedAt TEXT;
ALTER TABLE feature ADD COLUMN reconciliationSkippedBy TEXT;
