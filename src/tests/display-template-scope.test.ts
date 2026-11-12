// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  displayTemplateDependencies,
  displayTemplateDependencyGuard,
  isDisplayTemplateAvailable,
} from '../lib/db/services/displayTemplateScope'
import {
  renderLocalizedDisplayTemplate,
  type DisplayTemplateDefinition,
} from '../lib/templates/registry'
import type { Database } from '../lib/types'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const f of connections.splice(0)) f.sqlite.close()
})
function fixture() {
  const f = publicationSqlite({}, 100)
  connections.push(f)
  f.sqlite.exec(`
    CREATE TABLE hub(id TEXT,code TEXT);
    CREATE TABLE organisation(id TEXT,hubId TEXT);
    CREATE TABLE property(id TEXT,scope TEXT,projectId TEXT,organisationId TEXT,hubId TEXT,audience TEXT);
    CREATE TABLE organisationProperty(organisationId TEXT,propertyId TEXT);
    CREATE TABLE hubProperty(hubId TEXT,propertyId TEXT);
    INSERT INTO hub VALUES('core','core'),('local','local'),('foreign','foreign');
    INSERT INTO organisation VALUES('org','local'),('other','foreign');
    INSERT INTO property VALUES
      ('system','hub',NULL,NULL,'core','public'),
      ('inherited','organisation',NULL,'org',NULL,'public'),
      ('local','project','project',NULL,NULL,'public'),
      ('elsewhere','project','other-project',NULL,NULL,'public'),
      ('private','project','project',NULL,NULL,'internal'),
      ('hub-field','hub',NULL,NULL,'local','public');
  `)
  return { ...f, db: f.db as unknown as Database }
}
function definition(source: string, other?: string): DisplayTemplateDefinition {
  return {
    name: 'Test',
    code: 'test',
    target: 'feature',
    locales: { en: source, ...(other ? { 'zh-Hant': other } : {}) },
  }
}
const context = { organisationId: 'org', projectId: 'project' }
describe('template prerequisite scope', () => {
  it('allows system fields everywhere, without requiring either name', async () => {
    const f = fixture()
    const template = definition('{{ branch }}')
    expect(
      await isDisplayTemplateAvailable(f.db, template, { organisationId: null }),
    ).toBe(true)
    expect(
      renderLocalizedDisplayTemplate(template, 'en', { branch: 'Central' }, ''),
    ).toBe('Central')
  })
  it('uses the broadest inherited scope and rejects foreign or missing properties', async () => {
    const f = fixture()
    for (const field of ['system', 'inherited', 'hub-field']) {
      expect(
        await isDisplayTemplateAvailable(
          f.db,
          definition(`{{ properties.${field} }}`),
          context,
        ),
      ).toBe(true)
      expect(
        await isDisplayTemplateAvailable(
          f.db,
          definition(`{{ properties.${field} }}`),
          { organisationId: 'org' },
        ),
      ).toBe(true)
    }
    for (const field of ['inherited', 'hub-field'])
      expect(
        await isDisplayTemplateAvailable(
          f.db,
          definition(`{{ properties.${field} }}`),
          { organisationId: 'other' },
        ),
      ).toBe(false)
    // Naming configuration can deliberately use internal fields; ownership still constrains scope.
    expect(
      await isDisplayTemplateAvailable(
        f.db,
        definition('{{ properties.private }}'),
        context,
      ),
    ).toBe(true)
    for (const field of ['elsewhere', 'missing'])
      expect(
        await isDisplayTemplateAvailable(
          f.db,
          definition(`{{ properties.${field} }}`),
          context,
        ),
      ).toBe(false)
  })
  it('restricts any project dependency, including another locale and fallback', async () => {
    const f = fixture()
    const template = definition(
      '{{ feature.name }}',
      '{{ location.name ?? properties.local }}',
    )
    expect(displayTemplateDependencies(template)).toEqual(['local'])
    expect(await isDisplayTemplateAvailable(f.db, template, context)).toBe(true)
    expect(
      await isDisplayTemplateAvailable(f.db, template, { organisationId: 'org' }),
    ).toBe(false)
    expect(
      await isDisplayTemplateAvailable(f.db, template, {
        organisationId: 'org',
        projectId: 'other-project',
      }),
    ).toBe(false)
    // Cataloguing a project field elsewhere cannot widen its prerequisite scope.
    f.sqlite.exec("INSERT INTO organisationProperty VALUES('org','local')")
    expect(
      await isDisplayTemplateAvailable(f.db, template, { organisationId: 'org' }),
    ).toBe(false)
  })
  it('rechecks removal with the same predicate used by atomic writes', async () => {
    const f = fixture()
    const guard = displayTemplateDependencyGuard(
      definition('{{ properties.local }}'),
      context,
    )
    expect((await f.db.get<{ ok: number }>(sql`SELECT ${guard} ok`))?.ok).toBe(1)
    f.sqlite.exec("DELETE FROM property WHERE id='local'")
    expect((await f.db.get<{ ok: number }>(sql`SELECT ${guard} ok`))?.ok).toBe(0)
  })
  it('keeps a bounded binding count for large dependency sets', async () => {
    const f = fixture()
    const ids = Array.from({ length: 120 }, (_, index) => `p${index}`)
    const insert = f.sqlite.prepare(
      "INSERT INTO property VALUES(?,'project','project',NULL,NULL,'public')",
    )
    for (const id of ids) insert.run(id)
    expect(
      await isDisplayTemplateAvailable(
        f.db,
        definition(ids.map(id => `{{ properties.${id} }}`).join('')),
        context,
      ),
    ).toBe(true)
  })
})
