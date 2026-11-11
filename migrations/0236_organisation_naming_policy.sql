-- Refs #178. Organisation naming defaults inherit between Hub and Project.
-- Rebuild only the mutable projection; append-only policy revisions stay intact.
CREATE TABLE featureIntentPolicy_next (
  scopeType TEXT NOT NULL CHECK(scopeType IN ('hub','organisation','project','layer')),
  scopeId TEXT NOT NULL,
  definition TEXT CHECK(definition IS NULL OR json_valid(definition)),
  version INTEGER NOT NULL DEFAULT 1,
  actorId TEXT NOT NULL REFERENCES user(id),
  namingRules TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(namingRules) AND json_type(namingRules)='object'),
  PRIMARY KEY(scopeType, scopeId)
);
INSERT INTO featureIntentPolicy_next SELECT scopeType,scopeId,definition,version,actorId,namingRules FROM featureIntentPolicy;
DROP TABLE featureIntentPolicy;
ALTER TABLE featureIntentPolicy_next RENAME TO featureIntentPolicy;
