-- New Locations are shared unless an organisation chooses exclusive by default.
ALTER TABLE organisation ADD COLUMN defaultLocationVisibility TEXT NOT NULL DEFAULT 'shared' CHECK (defaultLocationVisibility IN ('shared', 'exclusive'));
