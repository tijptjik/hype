-- Missing flag keys inherit application defaults, including enabled image publication policies.
ALTER TABLE project ADD COLUMN flags TEXT NOT NULL DEFAULT '{}';
