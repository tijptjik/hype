-- Refs #213, #194. Apply the 1 km walking-access policy to saved results.
-- This is a policy rejection of a recorded route, not an engine failure or a new
-- routing calculation. Preserve original calculation/manual-review provenance.
-- Keep durable jobs, geometry and all unrelated feature fields unchanged.
UPDATE feature
SET mtrResolution=json_set(coalesce(mtrResolution,'{}'),
      '$.status','unreachable',
      '$.policyVersion','walk-1000m-v1',
      '$.maxWalkingMetres',1000,
      '$.policyAppliedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),
      '$.policyRejection',json_object('reason','max_walking_distance_exceeded',
        'previousStation',mtrStation,'previousExit',mtrExit,'previousDistance',mtrDistance)),
    mtrStation=NULL, mtrExit=NULL, mtrDistance=NULL
WHERE mtrDistance>1000;

-- Reject stale writers/import plans too; runtime and import paths enforce the
-- same inclusive 1,000 m boundary before attempting a write.
CREATE TRIGGER feature_mtr_walk_limit_insert
BEFORE INSERT ON feature WHEN NEW.mtrDistance>1000 BEGIN
  SELECT RAISE(ABORT,'MTR walking distance exceeds 1000 metres');
END;
CREATE TRIGGER feature_mtr_walk_limit_update
BEFORE UPDATE OF mtrDistance ON feature WHEN NEW.mtrDistance>1000 BEGIN
  SELECT RAISE(ABORT,'MTR walking distance exceeds 1000 metres');
END;
