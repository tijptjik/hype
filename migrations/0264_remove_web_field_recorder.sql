-- Remove the retired web recorder's private staging data and tables.
-- Existing audio objects in storage are not deleted by this database migration.
DROP TABLE IF EXISTS fieldRecorderMap;
DROP TABLE IF EXISTS fieldRecorderAudio;
DROP TABLE IF EXISTS fieldRecorderRecord;
DROP TABLE IF EXISTS fieldRecorderConfig;
