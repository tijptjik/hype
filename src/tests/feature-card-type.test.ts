import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { resolveFeatureCardType } from '#lib/features/cardType.js'
import { CARD_STYLE_CATALOG, CARD_STYLE_CODES } from '#lib/features/cardStyle.js'
import { ProjectEntityFormData } from '#lib/db/zod/schema/project.js'
import { LayerMetadataSchema, LayerListProfileAPI } from '#lib/db/zod/schema/layer.js'
import { toProjectFormInput } from '#lib/client/services/project.js'
import { toLayerFormInput } from '#lib/client/services/layer.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import { CompactAncestorsSchema } from '#lib/db/zod/schema/api.js'
import { toProjectSubmittedFields } from '#lib/api/services/authz/project.js'

const projectChoice = ProjectEntityFormData.pick({ cardStyleCode: true })

describe('saved feature card presentation', () => {
  it('defaults to Conditional and resolves explicit layer overrides before the project', () => {
    expect(resolveFeatureCardType({})).toBe('portal-band')
    expect(resolveFeatureCardType({ description: 'Available description' })).toBe(
      'standard',
    )
    expect(
      resolveFeatureCardType({ project: { cardStyleCode: 'no-description' } }),
    ).toBe('portal-band')
    expect(
      resolveFeatureCardType({
        project: { cardStyleCode: 'no-description' },
        layer: { cardStyleCode: 'full' },
      }),
    ).toBe('standard')
    expect(
      resolveFeatureCardType({
        project: { cardStyleCode: 'no-description' },
        layer: { cardStyleCode: null },
      }),
    ).toBe('portal-band')
    expect(resolveFeatureCardType({ project: { cardStyleCode: 'unknown' } })).toBe(
      'portal-band',
    )
  })

  it.each([null, undefined, '', '  ', '-', '<p><br></p>', '<p>&nbsp;</p>'])(
    'uses the compact renderer for an empty conditional description: %s',
    description => {
      expect(
        resolveFeatureCardType({
          project: { cardStyleCode: 'conditional' },
          description,
        }),
      ).toBe('portal-band')
    },
  )

  it('resolves conditional content after applying layer precedence', () => {
    expect(
      resolveFeatureCardType({
        project: { cardStyleCode: 'conditional' },
        description: '<p>A real description</p>',
      }),
    ).toBe('standard')
    expect(
      resolveFeatureCardType({
        project: { cardStyleCode: 'full' },
        layer: { cardStyleCode: 'conditional' },
        description: '',
      }),
    ).toBe('portal-band')
    expect(
      resolveFeatureCardType({
        project: { cardStyleCode: 'conditional' },
        layer: { cardStyleCode: 'full' },
        description: '',
      }),
    ).toBe('standard')
    expect(projectChoice.parse({ cardStyleCode: 'conditional' }).cardStyleCode).toBe(
      'conditional',
    )
    expect(
      LayerMetadataSchema.parse({ cardStyleCode: 'conditional' }).cardStyleCode,
    ).toBe('conditional')
  })

  it('validates saved choices and resets inheritance without discarding other metadata', () => {
    expect(projectChoice.parse({}).cardStyleCode).toBe('conditional')
    expect(projectChoice.safeParse({ cardStyleCode: 'bogus' }).success).toBe(false)
    expect(LayerMetadataSchema.safeParse({ cardStyleCode: 'bogus' }).success).toBe(
      false,
    )
    expect(
      LayerMetadataSchema.parse({
        cardStyleCode: '',
        mapStyleCode: 'neorange',
        other: 1,
      }),
    ).toEqual({ mapStyleCode: 'neorange', other: 1 })
    expect(toProjectFormInput().data.cardStyleCode).toBe('conditional')
    const input = toLayerFormInput({
      metadata: { cardStyleCode: 'no-description', mapStyleCode: null },
    } as unknown as Layer)
    expect(input.data.metadata).toEqual({
      cardStyleCode: 'no-description',
      mapStyleCode: '',
    })
    expect(toProjectSubmittedFields({ cardStyleCode: 'no-description' })).toEqual([
      'cardStyleCode',
    ])
  })

  it('retains style selections in lightweight public hierarchy payloads', () => {
    const project = { id: 'p', code: 'neon', i18n: {}, cardStyleCode: 'no-description' }
    expect(CompactAncestorsSchema.parse({ project }).project?.cardStyleCode).toBe(
      'no-description',
    )
    const shape = LayerListProfileAPI.pick({ cardStyleCode: true })
    expect(shape.parse({ cardStyleCode: 'full' })).toEqual({ cardStyleCode: 'full' })
  })

  it('registers the exact catalogue, preserves projects and enforces project references', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        "PRAGMA foreign_keys = ON; CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT); CREATE TABLE project (id text PRIMARY KEY, code text, organisationId TEXT); INSERT INTO project VALUES ('p', 'neon', null);",
      )
      db.exec(readFileSync('migrations/0093_card_styles.sql', 'utf8'))
      db.exec(readFileSync('migrations/0094_conditional_card_style.sql', 'utf8'))
      db.exec(readFileSync('migrations/0102_marker_presentation.sql', 'utf8'))
      db.exec(readFileSync('migrations/0103_breadline_presentation.sql', 'utf8'))
      expect(
        db
          .prepare('SELECT code FROM cardStyle ORDER BY code')
          .all()
          .map(row => row.code),
      ).toEqual([...CARD_STYLE_CODES].sort())
      expect(db.prepare('SELECT id, code, cardStyleCode FROM project').get()).toEqual({
        id: 'p',
        code: 'neon',
        cardStyleCode: 'full',
      })
      db.exec("UPDATE project SET cardStyleCode='no-description'")
      db.exec("UPDATE project SET cardStyleCode='conditional'")
      expect(() => db.exec("UPDATE project SET cardStyleCode='bogus'")).toThrow()
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      for (const style of CARD_STYLE_CATALOG) {
        expect(readFileSync(`static${style.preview}`, 'utf8')).toContain('<svg')
      }
    } finally {
      db.close()
    }
  })
})
