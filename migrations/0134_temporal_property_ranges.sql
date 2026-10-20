-- Preserve every existing type while extending the inline enum constraint without
-- rebuilding the property table or disturbing foreign-key children.
ALTER TABLE property ADD COLUMN dataTypeNext TEXT NOT NULL DEFAULT 'text' CHECK(dataTypeNext IN ('text','number','date','boolean','link','dateRange','timeRange'));
UPDATE property SET dataTypeNext=dataType;
ALTER TABLE property DROP COLUMN dataType;
ALTER TABLE property RENAME COLUMN dataTypeNext TO dataType;
ALTER TABLE property ADD COLUMN dateResolution TEXT NOT NULL DEFAULT 'day' CHECK(dateResolution IN ('decade','year','month','day'));
ALTER TABLE property ADD COLUMN timeMaxHour INTEGER NOT NULL DEFAULT 24 CHECK(timeMaxHour IN (24,36));
