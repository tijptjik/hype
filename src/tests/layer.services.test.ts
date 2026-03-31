import { describe, expect, it } from 'vitest'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import {
  hasOrganisationLayersCondition,
  hasProjectLayersCondition,
} from '$lib/db/services/layer'

const dialect = new SQLiteSyncDialect()

describe('layer visibility existence predicates', () => {
  it('requires published and non-archived layers for public project visibility', () => {
    const query = dialect.sqlToQuery(
      hasProjectLayersCondition({
        requirePublished: true,
        requireNonArchived: true,
      }),
    )

    expect(query.sql).toContain('"layer"."isPublished" = 1')
    expect(query.sql).toContain('"layer"."isArchived" = 0')
  })

  it('requires published and non-archived layers for public organisation visibility', () => {
    const query = dialect.sqlToQuery(
      hasOrganisationLayersCondition({
        requirePublished: true,
        requireNonArchived: true,
      }),
    )

    expect(query.sql).toContain('"layer"."isPublished" = 1')
    expect(query.sql).toContain('"layer"."isArchived" = 0')
  })

  it('keeps admin visibility predicates broad when public filters are not requested', () => {
    const projectQuery = dialect.sqlToQuery(hasProjectLayersCondition())
    const organisationQuery = dialect.sqlToQuery(hasOrganisationLayersCondition())

    expect(projectQuery.sql).not.toContain('"layer"."isPublished" = 1')
    expect(projectQuery.sql).not.toContain('"layer"."isArchived" = 0')
    expect(organisationQuery.sql).not.toContain('"layer"."isPublished" = 1')
    expect(organisationQuery.sql).not.toContain('"layer"."isArchived" = 0')
  })
})
