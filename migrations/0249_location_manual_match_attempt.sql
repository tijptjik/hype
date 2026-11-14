-- An explicit manual review accepted that no upstream match was available.
-- NULL means this unmatched Location has not received that disposition.
-- Keep this separate from sourceAvailability, which tracks linked publisher records.
ALTER TABLE location ADD COLUMN lastManualMatchAttemptAt TEXT;
