-- Missing flag keys inherit application defaults, including enabled image publication policies and 3D address options.
ALTER TABLE project ADD COLUMN flags TEXT NOT NULL DEFAULT '{}';
