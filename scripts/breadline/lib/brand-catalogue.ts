// NODE
import { createHash } from 'node:crypto'
// DOMAIN
import { seedIdentityCatalogue } from '../../../src/lib/locations/identityCatalogue'
// TYPES
import type { LocationBrand } from '../../../src/lib/locations/model'

/** Quote a generated SQL literal, retaining upstream names without SQL interpolation.
 * @param value String or JSON value. @returns SQLite literal.
 */
function quote(value: unknown): string {
  return `'${(typeof value === 'string' ? value : JSON.stringify(value)).replaceAll("'", "''")}'`
}

/** Add an imported brand and its community-only link in the import transaction.
 * @param input Imported normalized brand and persisted Location source identity.
 * @returns SQL retaining curated catalogue names and the raw source revision.
 * @remarks The current source mapping wins concurrent registration. Group, format and branch are never inferred.
 */
export function breadlineBrandCatalogueSql(input: {
  brand: LocationBrand
  locationId: string
  sourceRevisionId: string
  actorId: string
}): string {
  const source = 'brand:breadlineBrand',
    sourceId = input.brand.identifiers.breadlineBrand
  if (!sourceId) throw new Error('Reviewed Breadline brand identity required')
  const id = `bl-brand-${createHash('sha256').update(sourceId).digest('hex').slice(0, 24)}`
  const content = seedIdentityCatalogue(input.brand.names)
  const revision = `bl-brand-link-${input.locationId}`
  return `
INSERT INTO identityCatalogue(id,kind,version)
SELECT ${quote(id)},'brand',1 WHERE NOT EXISTS(SELECT 1 FROM identityCatalogueSource WHERE source=${quote(source)} AND sourceId=${quote(sourceId)})
ON CONFLICT(id) DO NOTHING;
INSERT INTO identityCatalogueRevisionContent(catalogueId,version,content,actorId,createdAt)
SELECT ${quote(id)},1,${quote(content)},${quote(input.actorId)},strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE EXISTS(SELECT 1 FROM identityCatalogue WHERE id=${quote(id)}) AND NOT EXISTS(SELECT 1 FROM identityCatalogueRevision WHERE catalogueId=${quote(id)} AND version=1);
INSERT INTO identityCatalogueSource(source,sourceId,catalogueId)
VALUES(${quote(source)},${quote(sourceId)},${quote(id)}) ON CONFLICT(source,sourceId) DO NOTHING;
INSERT INTO locationSharedRevision(id,locationId,previousRevisionId,sourceRevisionId,corrections,actorId,provenance)
SELECT ${quote(revision)},${quote(input.locationId)},NULL,${quote(input.sourceRevisionId)},json_object(
  'brandId',json_object('original',json_object('present',json('false')),'choice',json_object('mode','override','value',c.id),'sourceRevisionId',${quote(input.sourceRevisionId)},'actorId',${quote(input.actorId)},'editedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'catalogue',json_patch(r.content,json_object('id',c.id,'kind',c.kind,'version',c.version))),
  'brands',json_object('original',json_object('present',json('true'),'value',json(${quote([input.brand])})),'choice',json_object('mode','override','value',json_array(json_object('identifiers',json_object('catalogueId',c.id,'catalogueVersion',cast(c.version AS TEXT)),'names',json((SELECT json_group_object(key,json_extract(value,'$.name')) FROM json_each(json_extract(r.content,'$.i18n'))))))),'sourceRevisionId',${quote(input.sourceRevisionId)},'actorId',${quote(input.actorId)},'editedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
  ${quote(input.actorId)},' {"kind":"breadline-brand-import"}'
FROM identityCatalogueSource s JOIN identityCatalogue c ON c.id=s.catalogueId JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version
WHERE s.source=${quote(source)} AND s.sourceId=${quote(sourceId)} AND NOT EXISTS(SELECT 1 FROM locationSharedRevision WHERE locationId=${quote(input.locationId)});
`
}
