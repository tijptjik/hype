-- Refs #194. Operators are independent of brands, corporate groups and access ownership.
CREATE TABLE operator (
  id TEXT PRIMARY KEY NOT NULL,
  logo TEXT,
  website TEXT,
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE operatorI18n (
  operatorId TEXT NOT NULL REFERENCES operator(id) ON DELETE RESTRICT,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY(operatorId,locale)
);
CREATE TABLE locationOperator (
  locationId TEXT PRIMARY KEY NOT NULL REFERENCES location(id) ON DELETE RESTRICT,
  operatorId TEXT NOT NULL REFERENCES operator(id) ON DELETE RESTRICT,
  createdBy TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX location_operator_operator ON locationOperator(operatorId);

-- Reuse the attributed MTR symbol documented in static/mapData/README.md.
INSERT INTO operator(id,logo,website)
VALUES ('mtr-corporation','/mapSprites/breadline-light/exit.svg','https://www.mtr.com.hk/');
INSERT INTO operatorI18n(operatorId,locale,name)
VALUES ('mtr-corporation','en','MTR Corporation');
