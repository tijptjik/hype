-- Refs #189. No existing organisation receives profile-edit permission implicitly.
ALTER TABLE organisation ADD COLUMN permitUserDetailsEdit INTEGER NOT NULL DEFAULT 0
  CHECK (permitUserDetailsEdit IN (0, 1));
