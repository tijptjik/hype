import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import ts from 'typescript'
const source = readFileSync('src/lib/api/image.remote.ts', 'utf8')
const section = source.slice(
  source.indexOf('const rotateDimensionsForRotation'),
  source.indexOf('const buildReplacementMetadataDocument'),
)
const js = ts.transpileModule(section, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const rotate = new Function(
  'normalizeRotation',
  `${js}; return toRotatedMetadataDocument`,
)((value: number) => ((value % 360) + 360) % 360)
it('changes orientation by metadata without compounding dimensions on successive rotations', () => {
  const original = { originalWidth: 100, originalHeight: 200, rotation: 0 }
  const once = rotate({
    document: original,
    rotation: 90,
    version: 2,
    timestamp: 'now',
  })
  const twice = rotate({
    document: once,
    rotation: 180,
    version: 3,
    timestamp: 'later',
  })
  expect(once).toMatchObject({
    originalWidth: 200,
    originalHeight: 100,
    renderRotation: 90,
    sourceRotation: 0,
  })
  expect(twice).toMatchObject({
    originalWidth: 100,
    originalHeight: 200,
    renderRotation: 180,
    sourceRotation: 0,
  })
})
it('does not apply a legacy baked rotation twice', () => {
  const legacy = { originalWidth: 200, originalHeight: 100, rotation: 90 }
  expect(
    rotate({ document: legacy, rotation: 180, version: 2, timestamp: 'now' }),
  ).toMatchObject({
    originalWidth: 100,
    originalHeight: 200,
    sourceRotation: 90,
    renderRotation: 90,
  })
})
