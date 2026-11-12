// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import {
  featureI18n,
  hubI18n,
  organisationI18n,
  projectI18n,
  layerI18n,
  featurePropertyI18n,
  propertyI18n,
  propertyValueI18n,
} from '../schema'
// CONTENT
import { canonicalContentTag, contentFormKey } from '#lib/i18n/contentRecords.js'
import { verifyAutomaticTranslation } from '#lib/i18n/automaticReceipt.server.js'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  AutomaticTranslations,
  TranslationProvenance,
} from '#lib/i18n/automatic.js'

type Resource =
  | 'feature'
  | 'hub'
  | 'organisation'
  | 'project'
  | 'layer'
  | 'property'
  | 'propertyValue'
  | 'featureProperty'
type Row = Record<string, unknown> & {
  autoTranslated?: AutomaticTranslations | null
  translationProvenance?: TranslationProvenance | null
}
const tables = {
  featureProperty: featurePropertyI18n,
  feature: featureI18n,
  hub: hubI18n,
  organisation: organisationI18n,
  project: projectI18n,
  layer: layerI18n,
  property: propertyI18n,
  propertyValue: propertyValueI18n,
}
const ownerColumns = {
  featureProperty: featurePropertyI18n.featureId,
  feature: featureI18n.featureId,
  hub: hubI18n.hubId,
  organisation: organisationI18n.organisationId,
  project: projectI18n.projectId,
  layer: layerI18n.layerId,
  property: propertyI18n.propertyId,
  propertyValue: propertyValueI18n.propertyValueId,
}

/** Preserve stored metadata and validate newly generated candidates before an authorised form write.
 * @param options Submitted locale rows and server-owned request identity.
 * @returns Nothing; normalizes metadata in the existing save payload.
 * @remarks This does not authorise writes. The owning remote must still run its existing
 * permission, revision and atomic save checks. Only explicit pending acceptances are promoted.
 */
export async function prepareAutomaticTranslationSubmission(options: {
  db: Database
  resource: Resource
  id?: string
  rows?: Record<string, unknown>
  actorId: string
  secret?: string
  propertyId?: string
}): Promise<void> {
  if (!options.rows) return
  const { db, resource, rows, actorId, secret } = options
  const existing = options.id
    ? await db
        .select()
        .from(tables[resource])
        .where(
          and(
            eq(ownerColumns[resource], options.id),
            resource === 'featureProperty'
              ? eq(featurePropertyI18n.propertyId, options.propertyId ?? '')
              : undefined,
          ),
        )
    : []
  const previous = new Map(
    existing.map(row => [contentFormKey(row.locale), row as unknown as Row]),
  )
  // Keep cache-only languages that were generated after the editor loaded its controls.
  for (const [locale, row] of previous) {
    if (row.isAutomaticOnly === true && !Object.hasOwn(rows, locale))
      rows[locale] = { ...row }
  }
  const sourceRows = new Map(previous)
  for (const [locale, row] of Object.entries(rows))
    sourceRows.set(contentFormKey(locale), row as Row)

  // Preserve provenance on ordinary saves; only signed candidates may add generated values.
  for (const [locale, input] of Object.entries(rows)) {
    const row = input as Row
    const prior = previous.get(contentFormKey(locale))
    const automatic = { ...prior?.autoTranslated }
    const provenance = { ...prior?.translationProvenance }
    for (const [field, candidate] of Object.entries(row.autoTranslated ?? {})) {
      const unchanged =
        JSON.stringify(prior?.autoTranslated?.[field]) === JSON.stringify(candidate)
      if (
        !unchanged &&
        (!secret ||
          !(await verifyAutomaticTranslation(
            candidate,
            canonicalContentTag(locale),
            secret,
          )))
      )
        throw error(400, 'Invalid automatic translation provenance')
      automatic[field] = candidate
    }
    for (const [field, acceptance] of Object.entries(row.translationProvenance ?? {})) {
      if (acceptance.acceptedBy !== 'pending') continue
      // Validate legacy acceptance against the stored value without inventing provider metadata.
      if ('origin' in acceptance && acceptance.origin === 'legacy-ai') {
        if (
          prior?.[field] !== acceptance.value ||
          !(prior?.[`${field}Gen`] === true || prior?.[`${field}Gen`] === 'true')
        )
          throw error(409, 'Original translation changed')
        if (typeof row[field] !== 'string' || !(row[field] as string).trim())
          throw error(400, 'Accepted translation is empty')
        provenance[field] = {
          ...acceptance,
          acceptedValue: row[field] as string,
          acceptedBy: actorId,
          acceptedAt: new Date().toISOString(),
        }
        row[`${field}Gen`] = false
        continue
      }
      const candidate = automatic[field]
      const source = candidate
        ? sourceRows.get(contentFormKey(candidate.sourceLocale))
        : undefined
      if (
        !candidate ||
        source?.[field] !== candidate.sourceText ||
        source?.[`${field}Gen`] === true ||
        source?.[`${field}Gen`] === 'true'
      )
        throw error(409, 'Translation source changed; generate the suggestion again')
      if (typeof row[field] !== 'string' || !row[field].trim())
        throw error(400, 'Accepted translation is empty')
      provenance[field] = {
        ...candidate,
        humanVerified: acceptance.humanVerified === true,
        acceptedValue: row[field] as string,
        acceptedBy: actorId,
        acceptedAt: new Date().toISOString(),
      }
      row[`${field}Gen`] = false
    }
    // Legacy generated fields have no reliable provider/source receipt; retain only their known AI origin.
    for (const [field, value] of Object.entries(row)) {
      if (
        !provenance[field] &&
        typeof value === 'string' &&
        value.trim() &&
        (prior?.[`${field}Gen`] === true || prior?.[`${field}Gen`] === 'true') &&
        (row[`${field}Gen`] === false || row[`${field}Gen`] === 'false') &&
        typeof prior?.[field] === 'string' &&
        (prior[field] as string).trim()
      ) {
        provenance[field] = {
          origin: 'legacy-ai',
          humanVerified: value !== prior[field],
          value: prior[field] as string,
          acceptedValue: value,
          acceptedBy: actorId,
          acceptedAt: new Date().toISOString(),
        }
      }
    }
    if (prior?.isAutomaticOnly === true) {
      const fields =
        resource === 'feature'
          ? ['title', 'description', 'displayAddress']
          : resource === 'featureProperty' || resource === 'propertyValue'
            ? ['value']
            : resource === 'property'
              ? ['label', 'placeholder']
              : [
                  'name',
                  'nameShort',
                  'description',
                  'subscriptionBenefits',
                  'privacyPolicy',
                  'termsOfService',
                ]
      row.isAutomaticOnly = !fields.some(
        field => typeof row[field] === 'string' && (row[field] as string).trim(),
      )
    }
    row.autoTranslated = Object.keys(automatic).length ? automatic : null
    row.translationProvenance = Object.keys(provenance).length ? provenance : null
  }
}

/** Validate nested catalogue translations before the owning authorized catalogue transaction.
 * @param options Submitted definitions, actor and signing key.
 * @returns Completion of metadata validation; no database writes occur here.
 */
export async function preparePropertyTranslationSubmission(options: {
  db: Database
  properties?: readonly {
    id?: string
    i18n?: Record<string, unknown> | null
    values?: readonly { id?: string; i18n?: Record<string, unknown> | null }[] | null
  }[]
  actorId: string
  secret?: string
}): Promise<void> {
  for (const property of options.properties ?? []) {
    await prepareAutomaticTranslationSubmission({
      ...options,
      resource: 'property',
      id: property.id,
      rows: property.i18n ?? undefined,
    })
    for (const value of property.values ?? []) {
      await prepareAutomaticTranslationSubmission({
        ...options,
        resource: 'propertyValue',
        id: value.id,
        rows: value.i18n ?? undefined,
      })
    }
  }
}
