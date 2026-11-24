// VALIDATION
import { z } from 'zod'
// DOMAIN
import {
  researchConfigurationSchema,
  researchConfigurationVersion,
  researchLayerOverridesSchema,
  propertySettingsSchema,
  researchPropertyIncluded,
} from './configuration'
import { isRangeProperty, normalizeRangeValue } from '#lib/properties/range.js'
import { normalizeLinkValue, propertyValueRegistry } from '#lib/properties/value.js'
import { parseDisplayTemplate } from '#lib/templates/displayTemplate.js'
// TYPES
import type { ResearchConfiguration, ResearchLayerOverrides } from './configuration'
import type { Property } from '#lib/db/zod/schema/property.types.js'

type Definition = Pick<Property, 'id' | 'cardinality' | 'dataType' | 'values' | 'type'>
type RawConfiguration = {
  settings: unknown
  layers: { layerId: string; isDefault: boolean; overrides: unknown }[]
}
type Catalogue = {
  properties: Definition[]
  types: string[]
  layers: Map<string, string[]>
}
type Notices = { removed: string[]; defaulted: string[]; changed: string[] }
type MigrationResult = Notices & {
  settings: ResearchConfiguration
  layers: { layerId: string; isDefault: boolean; overrides: ResearchLayerOverrides }[]
}
type PropertyDefault = ResearchConfiguration['properties'][string]['defaultValue']

// Register a pure transformation under its exact source and destination versions.
// Its output always goes through the same target schema and catalogue validation.
export const researchConfigurationMigrations: ReadonlyMap<
  string,
  (source: RawConfiguration, notices: Notices) => RawConfiguration
> = new Map([['0:1', migrateLegacyPropertyInclusion]])

/** Version zero allowed visibility and recordability to disagree. Preserve either affirmative choice.
 * @param source Original session and sparse layer settings. @param notices Review information.
 * @returns Equivalent settings under the single inclusion rule.
 */
function migrateLegacyPropertyInclusion(
  source: RawConfiguration,
  notices: Notices,
): RawConfiguration {
  const convert = (raw: unknown, path: string): Record<string, unknown> => {
    const fields = object(raw)
    if (!fields.properties) return fields
    const properties = Object.fromEntries(
      Object.entries(object(fields.properties)).map(([id, value]) => {
        const setting = object(value)
        if (
          typeof setting.isVisible === 'boolean' &&
          typeof setting.isRecordable === 'boolean' &&
          setting.isVisible !== setting.isRecordable
        ) {
          const included = researchPropertyIncluded({
            isVisible: setting.isVisible,
            isRecordable: setting.isRecordable,
          })
          notices.changed.push(
            path +
              '.properties.' +
              id +
              ' (included if either legacy switch was enabled)',
          )
          return [id, { ...setting, isVisible: included, isRecordable: included }]
        }
        return [id, value]
      }),
    )
    return { ...fields, properties }
  }
  return {
    settings: convert(source.settings, 'session'),
    layers: source.layers.map(layer => ({
      ...layer,
      overrides: convert(layer.overrides, 'layers.' + layer.layerId),
    })),
  }
}

/** Check a configured default against today's catalogue, including retired options.
 * @param property Current definition. @param value Stored default. @returns Whether it can be applied.
 */
export function validResearchPropertyDefault(
  property: Definition,
  value: PropertyDefault,
): boolean {
  if (value == null) return true
  if (
    property.values?.length ||
    (property.type === 'classifier' && property.dataType !== 'boolean')
  ) {
    const options = new Set(property.values?.map(option => option.id))
    const values = Array.isArray(value) ? value : [value]
    return (
      (property.cardinality === 'many') === Array.isArray(value) &&
      new Set(values).size === values.length &&
      values.every(item => typeof item === 'string' && options.has(item))
    )
  }
  if (property.dataType === 'boolean') return typeof value === 'boolean'
  if (property.dataType === 'number') return typeof value === 'number'
  if (typeof value !== 'string') return false
  try {
    if (property.dataType === 'link') normalizeLinkValue(property, value)
    if (isRangeProperty(property)) normalizeRangeValue(property, value)
    if (property.dataType === 'date') propertyValueRegistry.date.normalize(value)
    return true
  } catch {
    return false
  }
}

/** Read only JSON object members. @param value Untrusted stored data. @returns Own properties. */
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Project a value onto the target schema recursively so one bad field cannot discard its siblings.
 * @param schema Target field. @param raw Historical value. @param fallback Target default.
 * @param path Field path shown in review. @param notices Migration changes. @returns Repaired value.
 */
function project(
  schema: z.ZodType,
  raw: unknown,
  fallback: unknown,
  path: string,
  notices: Notices,
): unknown {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional)
    return project(schema.unwrap() as z.ZodType, raw, fallback, path, notices)
  if (schema instanceof z.ZodObject) {
    if (
      raw !== undefined &&
      (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    )
      notices.removed.push(path)
    const fields = object(raw)
    const defaults = object(fallback)
    for (const key of Object.keys(fields))
      if (!Object.hasOwn(schema.shape, key)) notices.removed.push(path + '.' + key)
    return Object.fromEntries(
      Object.entries(schema.shape).flatMap(([key, child]) => {
        const value = project(
          child as z.ZodType,
          fields[key],
          defaults[key],
          path + '.' + key,
          notices,
        )
        return value === undefined ? [] : [[key, value]]
      }),
    )
  }
  if (raw !== undefined) {
    const result = schema.safeParse(raw)
    if (result.success) return result.data
    notices.removed.push(path)
  }
  if (fallback !== undefined) notices.defaulted.push(path)
  return fallback
}

/** Carry compatible values into the current schema and report every discarded or defaulted setting.
 * @param source Stored session and sparse overrides. @param from Stored version. @param to Requested target.
 * @param codeFallback Stable session identity for a missing code. @param catalogue Current choices.
 * @returns Reviewable configuration, layers and migration changes.
 */
export function migrateResearchSettings(
  source: RawConfiguration,
  from: number,
  to: number,
  codeFallback: string,
  catalogue: Catalogue,
): MigrationResult {
  if (
    !Number.isInteger(from) ||
    from < 0 ||
    from >= to ||
    to !== researchConfigurationVersion
  )
    throw new Error('Unsupported field session migration.')
  const notices: Notices = { removed: [], defaulted: [], changed: [] }
  const custom = researchConfigurationMigrations.get(from + ':' + to)
  let input = source
  if (custom) input = custom(input, notices)
  else {
    // Retain intermediate rename and semantic upgrades when a session skips several releases.
    for (let version = from; version < to; version++) {
      const step = researchConfigurationMigrations.get(version + ':' + (version + 1))
      if (step) input = step(input, notices)
    }
  }
  const baseline = researchConfigurationSchema.parse({
    code: codeFallback,
    properties: {},
  })
  const properties = new Map(
    catalogue.properties.map(property => [property.id, property]),
  )
  baseline.defaults.featureType = catalogue.types[0] ?? baseline.defaults.featureType

  // Migrate property IDs individually and keep layer overrides sparse so inheritance survives.
  /** Repair a session or layer using the same target property definitions.
   * @param raw Source settings. @param path Review path. @param layer Whether missing fields inherit.
   * @returns Settings ready for final target validation.
   */
  function scope(raw: unknown, path: string, layer: boolean): Record<string, unknown> {
    const fields = object(raw)
    const migrated = Object.fromEntries(
      Object.entries(object(fields.properties)).flatMap(([id, value]) => {
        const definition = properties.get(id)
        const prefix = path + '.properties.' + id
        if (!definition) {
          notices.removed.push(prefix)
          return []
        }
        const settings = object(
          project(
            propertySettingsSchema,
            value,
            layer ? {} : { isVisible: false, isRecordable: false },
            prefix,
            notices,
          ),
        )
        if (
          Array.isArray(settings.defaultValue) &&
          definition.cardinality === 'many' &&
          definition.values?.length
        ) {
          const allowed = new Set(definition.values.map(option => option.id))
          settings.defaultValue = [
            ...new Set(
              settings.defaultValue.filter(id => {
                if (allowed.has(id)) return true
                notices.removed.push(prefix + '.defaultValue[' + id + ']')
                return false
              }),
            ),
          ]
        }
        if (
          !validResearchPropertyDefault(
            definition,
            settings.defaultValue as PropertyDefault,
          )
        ) {
          delete settings.defaultValue
          notices.removed.push(prefix + '.defaultValue')
        }
        return [[id, settings]]
      }),
    )
    const schema = layer ? researchLayerOverridesSchema : researchConfigurationSchema
    const result = object(
      project(
        schema,
        { ...fields, properties: migrated },
        layer ? {} : baseline,
        path,
        notices,
      ),
    )
    // Discard title expressions referring to properties that disappeared from the catalogue.
    if (
      typeof result.titleTemplate === 'string' &&
      parseDisplayTemplate(result.titleTemplate).dependencies.some(
        key => key.startsWith('properties.') && !properties.has(key.slice(11)),
      )
    ) {
      notices.removed.push(path + '.titleTemplate')
      if (layer) delete result.titleTemplate
      else {
        result.titleTemplate = baseline.titleTemplate
        notices.defaulted.push(path + '.titleTemplate')
      }
    }
    return result
  }
  const settings = researchConfigurationSchema.parse(
    scope(input.settings, 'session', false),
  )
  if (!catalogue.types.includes(settings.defaults.featureType)) {
    if (!catalogue.types.length)
      throw new Error('Enable a project Feature type before migrating this session.')
    notices.removed.push('session.defaults.featureType')
    settings.defaults.featureType = catalogue.types[0]
    notices.defaulted.push('session.defaults.featureType')
  }
  const layers = input.layers.flatMap(row => {
    const types = catalogue.layers.get(row.layerId)
    const path = 'layers.' + row.layerId
    if (!types?.length) {
      notices.removed.push(path)
      return []
    }
    const overrides: ResearchLayerOverrides = researchLayerOverridesSchema.parse(
      scope(row.overrides, path, true),
    )
    if (
      !types.includes(overrides.defaults.featureType ?? settings.defaults.featureType)
    ) {
      if (overrides.defaults.featureType !== undefined)
        notices.removed.push(path + '.defaults.featureType')
      delete overrides.defaults.featureType
      if (!types.includes(settings.defaults.featureType))
        overrides.defaults.featureType = types[0]
      notices.defaulted.push(path + '.defaults.featureType')
    }
    return [{ ...row, overrides }]
  })
  return { settings, layers, ...notices }
}
