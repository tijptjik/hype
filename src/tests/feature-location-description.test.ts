import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { addressLocationNames } from '#lib/locations/addressIdentity.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

const route = readFileSync('src/routes/admin/features/[feature]/+page.svelte', 'utf8')
const remote = readFileSync('src/lib/api/feature.remote.ts', 'utf8')
const readiness = route.match(
  /^const draftLocationReady = \$derived\(([^\n]+)\)$/m,
)?.[1]
if (!readiness) throw new Error('Missing draft Location readiness expression')
const ready = new Function(
  'draftHasPin',
  'draftLocationAccepted',
  'profileLocationNames',
  `return (${readiness.trim().replace(/,$/, '')});`,
)
const validation = remote.slice(
  remote.indexOf('    const inheritsLocationName ='),
  remote.indexOf('    const created = await createFeatureForm'),
)
const validate = new Function(
  'createData',
  'presentationPolicy',
  'invalid',
  'issue',
  ts.transpileModule(validation, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
)

describe('Feature Location description and coordinate-only creation', () => {
  it('requires a marker but allows an absent or unaccepted description', () => {
    expect(ready(true, false, {})).toBe(true)
    expect(ready(true, true, { en: '   ' })).toBe(true)
    expect(ready(false, true, { en: 'Pier entrance' })).toBe(false)
    expect(ready(true, false, { en: 'Pier entrance' })).toBe(true)
    expect(ready(true, true, { 'zh-hant': '碼頭入口' })).toBe(true)
  })

  it('uses the authored address description without inventing text for a bare pin', () => {
    expect(addressLocationNames(emptyFeatureAddress())).toEqual({})
    const address = emptyFeatureAddress({ en: 'Entrance beside the pier' })
    expect(addressLocationNames(address).en).toBe('Entrance beside the pier')
  })

  it('allows marker-only creation without changing an independent Feature title', () => {
    const invalid = (message: string): never => {
      throw new Error(message)
    }
    const data = {
      i18n: { en: { title: 'Feature', displayAddress: ' ' } },
      locationNameMode: 'independent',
    }
    expect(() =>
      validate(data, { locationBasedNames: false }, invalid, (value: string) => value),
    ).not.toThrow()
    expect(data.i18n.en).toEqual({ title: 'Feature', displayAddress: ' ' })
  })

  it('fills inherited titles from the description and preserves named Locations', () => {
    for (const title of ['', 'Named venue']) {
      const data = {
        i18n: { en: { title, displayAddress: 'Pier entrance' } },
        locationNameMode: 'inherit',
      }
      validate(
        data,
        { locationBasedNames: false },
        () => {
          throw new Error('Invalid')
        },
        (value: string) => value,
      )
      expect(data.i18n.en.title).toBe(title || 'Pier entrance')
    }
  })
})
