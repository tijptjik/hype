PRAGMA foreign_keys=off;

ALTER TABLE geoProject RENAME TO _geoProject_OLD;

create table geoProject
(
    id             text                                                 not null primary key,
    metadata       text,
    createdAt      text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) not null,
    maintainerId   text,
    modifiedAt     text default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) not null,
    organisationId text                                                 not null
        references organisation,
    code           text                                                 not null,
    name           text                                                 not null,
    nameShort      text                                                 not null,
    description    text,
    license        text default 'Copyright'                             not null,
    attribution    text                                                 not null
);

INSERT INTO geoProject SELECT * FROM _geoProject_OLD;

PRAGMA foreign_keys=on;