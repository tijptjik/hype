// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// VITEST
import { describe, expect, it } from 'vitest'
// DOMAIN
import {
  divisionRoles,
  projectDivisionRoles,
} from '../../workers/division-refresh/src/roles'

const member = (id: string, kind: string, paths: string[][] = []) => ({
  id,
  class: kind,
  hierarchies: { full: paths.map(path => path.map(id => ({ id }))) },
})

describe('named division roles', () => {
  it('does not infer roles from levels or choose among alternative islands', () => {
    const rows = [
      member('area', 'area'),
      member('a', 'district'),
      member('b', 'district'),
      member('large', 'major_island'),
      member('small', 'minor_island', [['large'], ['elsewhere']]),
      member('sar', 'sar'),
    ]
    const result = Object.fromEntries(
      Object.keys(divisionRoles).map((key, index) => [
        key,
        projectDivisionRoles(rows)[index],
      ]),
    )
    expect(result).toMatchObject({
      areaId: 'area',
      districtId: null,
      islandId: null,
      countryId: null,
    })
    expect(
      projectDivisionRoles([rows[3], member('small', 'islet', [['large']])]).at(-1),
    ).toBe('small')
  })

  it('backfills roles with writer parity and preserves count deltas through moves and deletion', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(readFileSync('src/tests/fixtures/feature-query-base.sql', 'utf8'))
      for (const migration of [
        '0078_feature_spatial_index',
        '0079_feature_query_indexes',
        '0080_feature_count_cache',
        '0081_feature_search_fts',
        '0082_feature_division_refresh',
        '0083_feature_division_registry',
        '0084_division_facets',
      ])
        db.exec(readFileSync(`migrations/${migration}.sql`, 'utf8'))
      db.exec(
        `INSERT INTO feature(id,geometry,organisationId,projectId,layerId) VALUES ('a','{"type":"Point","coordinates":[5,5]}','org-1','project-1','layer-1'), ('b','{"type":"Point","coordinates":[5,5]}','org-1','project-1','layer-1')`,
      )
      const rows = [
        member('area', 'area'),
        member('d1', 'district'),
        member('d2', 'district'),
        member('hood', 'neighbourhood'),
        member('large', 'major_island'),
        member('small', 'islet', [['large']]),
      ]
      for (const row of rows) {
        db.prepare('INSERT INTO divisionDefinition VALUES(?,?,?)').run(
          row.id,
          'r',
          JSON.stringify(row),
        )
        for (const id of ['a', 'b'])
          db.prepare('INSERT INTO featureDivisionMembership VALUES(?,?,1)').run(
            id,
            row.id,
          )
      }
      const jobs = db.prepare('SELECT count(*) n FROM featureDivisionJob').get()?.n
      db.exec(readFileSync('migrations/0088_feature_division_roles.sql', 'utf8'))
      const roleNames = Object.keys(divisionRoles)
      expect(
        Object.values(
          db.prepare(`SELECT ${roleNames.join(',')} FROM feature WHERE id='a'`).get() ??
            {},
        ),
      ).toEqual(projectDivisionRoles(rows))
      expect(db.prepare('SELECT count(*) n FROM featureDivisionJob').get()?.n).toBe(
        jobs,
      )
      expect(
        db.prepare('SELECT count(*) n FROM featureDivisionMembership').get()?.n,
      ).toBe(12)
      expect(
        db.prepare('SELECT totalCount FROM featureCountRollup').get()?.totalCount,
      ).toBe(2)
      db.exec("UPDATE feature SET neighbourhoodId=NULL WHERE id='a'")
      expect(db.prepare('SELECT count(*) n FROM featureCountRollup').get()?.n).toBe(2)
      db.exec(
        `UPDATE feature SET geometry='{"type":"Point","coordinates":[6,6]}' WHERE id='a'`,
      )
      expect(
        Object.values(
          db
            .prepare(
              `SELECT ${roleNames.join(',')},divisionResolution FROM feature WHERE id='a'`,
            )
            .get() ?? {},
        ),
      ).toEqual(Array(12).fill(null))
      db.exec("DELETE FROM feature WHERE id='a'")
      expect(
        db.prepare('SELECT sum(totalCount) n FROM featureCountRollup').get()?.n,
      ).toBe(1)
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    } finally {
      db.close()
    }
  })
})
