-- Stable intent IDs preserve existing gallery history and Featured uniqueness.
CREATE TABLE hubImageIntentPolicy (
  hubId TEXT PRIMARY KEY NOT NULL REFERENCES hub(id) ON DELETE CASCADE,
  intents TEXT NOT NULL CHECK(json_valid(intents)),
  redirects TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(redirects)),
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE projectImageIntentPolicy (
  projectId TEXT PRIMARY KEY NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  intents TEXT CHECK(intents IS NULL OR json_valid(intents)),
  autoPublishUnclassified INTEGER NOT NULL DEFAULT 1 CHECK(autoPublishUnclassified IN (0,1)),
  redirects TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(redirects)),
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO hubImageIntentPolicy(hubId,intents) SELECT id,'[{"id":"canonical","label":"Featured","isPublished":true},{"id":"closeUp","label":"Close-up","isPublished":true},{"id":"context","label":"Context","isPublished":true},{"id":"general","label":"General","isPublished":true},{"id":"alternative","label":"Alternative","isPublished":false},{"id":"research","label":"Research","isPublished":false},{"id":"undefined","label":"Unclassified","isPublished":false}]' FROM hub;
-- New hubs take a snapshot, so subsequent core edits do not change independent hubs.
CREATE TRIGGER hub_image_intent_defaults AFTER INSERT ON hub BEGIN
  INSERT INTO hubImageIntentPolicy(hubId,intents) VALUES(NEW.id,
    COALESCE((SELECT p.intents FROM hubImageIntentPolicy p JOIN hub h ON h.id=p.hubId WHERE h.code='core'),'[{"id":"canonical","label":"Featured","isPublished":true},{"id":"closeUp","label":"Close-up","isPublished":true},{"id":"context","label":"Context","isPublished":true},{"id":"general","label":"General","isPublished":true},{"id":"alternative","label":"Alternative","isPublished":false},{"id":"research","label":"Research","isPublished":false},{"id":"undefined","label":"Unclassified","isPublished":false}]'));
END;

CREATE TABLE imageIntentPolicyRevision (
  id TEXT PRIMARY KEY NOT NULL,
  scopeType TEXT NOT NULL CHECK(scopeType IN ('hub','project')),
  scopeId TEXT NOT NULL,
  actorId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  previous TEXT NOT NULL CHECK(json_valid(previous)),
  current TEXT NOT NULL CHECK(json_valid(current))
);
CREATE TRIGGER image_intent_history_no_update BEFORE UPDATE ON imageIntentPolicyRevision BEGIN
  SELECT RAISE(ABORT,'Image intent history is immutable');
END;
CREATE TRIGGER image_intent_history_no_delete BEFORE DELETE ON imageIntentPolicyRevision BEGIN
  SELECT RAISE(ABORT,'Image intent history is immutable');
END;
