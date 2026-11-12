// RUNTIME
import { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/d1'
// SERVICES
import { readFeatureIntentPolicy } from '../../src/lib/db/services/featureIntentPolicy'
import { isDisplayTemplateAvailable } from '../../src/lib/db/services/displayTemplateScope'
import { DisplayTemplateDefinitionSchema } from '../../src/lib/templates/registry'
import { renderDisplayTemplate } from '../../src/lib/templates/displayTemplate'
import { DONOR_LAYER, CANONICAL_DONOR_TEMPLATE_ID, PAID_PROPERTY } from './donor-naming'
// TYPES
import type { Database } from '../../src/lib/types'

const database = process.argv[2]
if (!database) throw new Error('Pass the local SQLite database path')
const sqlite = new Sqlite(database, { readonly: true })
/** Match the production D1 named-row adapter while keeping verification read-only.
 * @param query SQL query. @param bindings Bound scalar parameters.
 * @returns Read-only D1 statement facade.
 */
function prepare(query: string, bindings: (string | number | null)[] = []) {
  return {
    bind: (...values: (string | number | null)[]) => prepare(query, values),
    all: async () => ({ results: sqlite.query(query).all(...bindings) }),
    raw: async () => sqlite.query(query).values(...bindings),
  }
}
const db = drizzle({ prepare } as never) as unknown as Database
const policy = await readFeatureIntentPolicy(db, { type: 'layer', id: DONOR_LAYER })
const rule = policy.types.find(type => type.id === 'place')?.nameRule
if (rule?.registry?.id !== CANONICAL_DONOR_TEMPLATE_ID)
  throw new Error('New Place features do not inherit the donor naming template')
const row = sqlite
  .query(
    'SELECT definition FROM displayTemplateRevision WHERE templateId=? AND version=?',
  )
  .get(CANONICAL_DONOR_TEMPLATE_ID, rule.registry.version) as { definition: string }
const definition = DisplayTemplateDefinitionSchema.parse(JSON.parse(row.definition))
const owner = sqlite
  .query('SELECT projectId,organisationId FROM layer WHERE id=?')
  .get(DONOR_LAYER) as { projectId: string; organisationId: string }
if (!(await isDisplayTemplateAvailable(db, definition, owner)))
  throw new Error('Template is unavailable within Breadline')
if (
  await isDisplayTemplateAvailable(db, definition, {
    ...owner,
    projectId: 'different-project',
  })
)
  throw new Error('Template leaked outside its prerequisite project')
// Exercise future values through the installed definition, without creating test donors.
const future = {
  'brand.name': 'New Brand',
  'format.name': 'Bakery',
  branch: 'Central MTR',
  accessHint: 'D',
  [`properties.${PAID_PROPERTY}`]: true,
}
const generated = renderDisplayTemplate(definition.locales.en, future)
if (generated !== 'New Brand Bakery - Central MTR (D - Paid)')
  throw new Error(generated)
if (
  renderDisplayTemplate(definition.locales.en, {
    ...future,
    accessHint: '',
    [`properties.${PAID_PROPERTY}`]: false,
  }) !== 'New Brand Bakery - Central MTR'
)
  throw new Error('Future missing hint/false paid state adds punctuation')
console.log(
  JSON.stringify({
    inheritedByNewPlaces: true,
    projectScopeEnforced: true,
    futureName: generated,
  }),
)
sqlite.close()
