// NODE
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// RASTERIZATION
import sharp from 'sharp'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. DETERMINISTIC VECTOR MARKS
// 2. SEAMLESS SVG TILES
// 3. SPRITE ATLAS GENERATION

const TILE_SIZE = 128
const OUTPUT = resolve(import.meta.dir, '../static/mapSprites/quercus')
const NAMES = ['paper', 'park', 'wood'] as const
type TextureName = (typeof NAMES)[number]

/**
 * Creates a repeatable random sequence for authored grain and botanical marks.
 * @param seed - Fixed integer identifying one texture's arrangement.
 * @returns A generator producing numbers in the half-open interval from zero to one.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let next = Math.imul(state ^ (state >>> 15), state | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Rounds SVG coordinates without embedding platform-dependent float tails.
 * @param value - Coordinate, length or opacity.
 * @returns A compact decimal suitable for SVG attributes.
 */
function decimal(value: number): string {
  return value.toFixed(3)
}

/**
 * Authors small flecks and uneven fibres on a transparent paper tile.
 * @returns SVG marks with their own alpha, intended for an additional map opacity.
 */
function createPaperMarks(): string {
  const random = seededRandom(0x71756572)
  const marks: string[] = []

  // Fine irregular stipple and short fibres suggest uncoated paper without a noise filter.
  for (let index = 0; index < 780; index += 1) {
    const x = random() * TILE_SIZE
    const y = random() * TILE_SIZE
    const radius = 0.23 + random() * 0.4
    marks.push(
      `<circle cx="${decimal(x)}" cy="${decimal(y)}" r="${decimal(radius)}" fill="#81786a" opacity="${decimal(0.24 + random() * 0.44)}"/>`,
    )
  }
  for (let index = 0; index < 230; index += 1) {
    const x = random() * TILE_SIZE
    const y = random() * TILE_SIZE
    const length = 0.8 + random() * 2.7
    const angle = random() * Math.PI
    const endX = x + Math.cos(angle) * length
    const endY = y + Math.sin(angle) * length
    marks.push(
      `<path d="M${decimal(x)} ${decimal(y)} Q${decimal((x + endX) / 2 + 0.3)} ${decimal((y + endY) / 2 - 0.2)} ${decimal(endX)} ${decimal(endY)}" fill="none" stroke="#938775" stroke-width="${decimal(0.35 + random() * 0.35)}" stroke-linecap="round" opacity="${decimal(0.3 + random() * 0.4)}"/>`,
    )
  }
  return marks.join('\n')
}

/**
 * Authors sparse offset stipple for parkland, avoiding regular rows of dots.
 * @returns Transparent olive marks suitable for quiet park fills.
 */
function createParkMarks(): string {
  const random = seededRandom(0x7061726b)
  const marks: string[] = []

  // Jittered cells give each dot breathing room and avoid conspicuous clusters.
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      if (random() < 0.15) continue
      const x = (column + 0.15 + random() * 0.7) * 8
      const y = (row + 0.15 + random() * 0.7) * 8
      const radius = 0.5 + random() * 0.48
      marks.push(
        `<ellipse cx="${decimal(x)}" cy="${decimal(y)}" rx="${decimal(radius)}" ry="${decimal(radius * (0.7 + random() * 0.5))}" fill="#6d7250" opacity="${decimal(0.55 + random() * 0.35)}"/>`,
      )
    }
  }
  return marks.join('\n')
}

/**
 * Authors tiny broken hatching for woodland without tree icons or large motifs.
 * @returns Transparent diagonal olive strokes with irregular spacing and lengths.
 */
function createWoodMarks(): string {
  const random = seededRandom(0x776f6f64)
  const marks: string[] = []

  // Broken strokes distinguish woodland from the open park stipple at walking zooms.
  for (let row = 0; row < 18; row += 1) {
    for (let column = 0; column < 18; column += 1) {
      if (random() < 0.2) continue
      const x = (column + random() * 0.6) * (TILE_SIZE / 18)
      const y = (row + random() * 0.6) * (TILE_SIZE / 18)
      const length = 1.7 + random() * 2.3
      marks.push(
        `<path d="M${decimal(x)} ${decimal(y)} l${decimal(length)} ${decimal(-length * (0.7 + random() * 0.35))}" fill="none" stroke="#68704f" stroke-width="${decimal(0.5 + random() * 0.3)}" stroke-linecap="round" opacity="${decimal(0.55 + random() * 0.35)}"/>`,
      )
    }
  }
  return marks.join('\n')
}

/**
 * Wraps edge-crossing marks onto each opposing edge before the SVG viewport clips them.
 * @param name - Unique SVG identifier, also used as the sprite entry name.
 * @param marks - Authored vector marks, potentially crossing a tile edge.
 * @returns Repeating SVG body with no opaque background.
 * @remarks All nine copies use the same marks, so clipping never leaves a seam.
 */
function createTileBody(name: TextureName, marks: string): string {
  const copies = [-TILE_SIZE, 0, TILE_SIZE].flatMap(y =>
    [-TILE_SIZE, 0, TILE_SIZE].map(
      x => `<use href="#${name}-marks" transform="translate(${x} ${y})"/>`,
    ),
  )
  return `<defs><g id="${name}-marks">\n${marks}\n</g></defs>\n${copies.join('\n')}`
}

/**
 * Builds inspectable vector sources and one- and two-density MapLibre sprite atlases.
 * @returns Nothing; writes deterministic SVG, PNG and JSON files under static/mapSprites.
 * @remarks Sprite entries are 128 logical pixels; double-density metadata uses physical
 * pixel dimensions and pixelRatio 2. Map styles control final opacity independently.
 */
async function main(): Promise<void> {
  await mkdir(OUTPUT, { recursive: true })
  const marks: Record<TextureName, string> = {
    paper: createPaperMarks(),
    park: createParkMarks(),
    wood: createWoodMarks(),
  }
  const bodies = NAMES.map(name => createTileBody(name, marks[name]))
  const svgHeader = '<svg xmlns="http://www.w3.org/2000/svg"'

  // Preserve each vector tile and the atlas so every raster mark is inspectable.
  await Promise.all(
    NAMES.map((name, index) =>
      writeFile(
        resolve(OUTPUT, `${name}.svg`),
        `${svgHeader} width="128" height="128" viewBox="0 0 128 128"><title>Quercus ${name} texture</title>\n${bodies[index]}\n</svg>\n`,
      ),
    ),
  )
  const atlasSvg = `${svgHeader} width="384" height="128" viewBox="0 0 384 128"><title>Quercus seamless cartographic textures</title>\n${NAMES.map((name, index) => `<svg x="${index * TILE_SIZE}" y="0" width="128" height="128" viewBox="0 0 128 128" overflow="hidden" aria-label="${name}">${bodies[index]}</svg>`).join('\n')}\n</svg>\n`
  await writeFile(resolve(OUTPUT, 'texture.svg'), atlasSvg)

  // Rasterize at the final density from vectors to keep the high-density grain sharp.
  for (const pixelRatio of [1, 2]) {
    const suffix = pixelRatio === 1 ? '' : '@2x'
    const metadata = Object.fromEntries(
      NAMES.map((name, index) => [
        name,
        {
          width: TILE_SIZE * pixelRatio,
          height: TILE_SIZE * pixelRatio,
          x: index * TILE_SIZE * pixelRatio,
          y: 0,
          pixelRatio,
        },
      ]),
    )
    await sharp(Buffer.from(atlasSvg), { density: 72 * pixelRatio })
      .png({ compressionLevel: 9 })
      .toFile(resolve(OUTPUT, `texture${suffix}.png`))
    await writeFile(
      resolve(OUTPUT, `texture${suffix}.json`),
      `${JSON.stringify(metadata, null, 2)}\n`,
    )
  }
  console.log('Generated Quercus paper, park and wood sprite textures at 1x and 2x')
}

if (import.meta.main) await main()
