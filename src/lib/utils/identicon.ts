/** Hash a stable identity seed. @param value Seed. @returns Unsigned hash. */
function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

/** Generate the shared deterministic fallback artwork. @param seed Stable identity. @returns SVG data URL. */
export function getFeatureIdenticonUrl(seed: string): string {
  const hash = hashString(seed)
  const palette = ['#1f6b5f', '#2e6fbb', '#b86b2b', '#7f4fa5', '#c44d5d']
  const backgroundPalette = ['#f4efe6', '#ecf4f2', '#eef3f8', '#f5eef8', '#f8eeef']
  const foreground = palette[hash % palette.length]
  const background = backgroundPalette[(hash >>> 3) % backgroundPalette.length]
  const gridSize = 5
  const cellSize = 10
  const offset = 7
  const cells: string[] = []

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < Math.ceil(gridSize / 2); column += 1) {
      const bitIndex = row * Math.ceil(gridSize / 2) + column
      const isFilled = ((hash >>> (bitIndex % 24)) & 1) === 1

      if (!isFilled) continue

      const mirroredColumn = gridSize - 1 - column
      const x = offset + column * cellSize
      const y = offset + row * cellSize

      cells.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${foreground}"/>`,
      )

      if (mirroredColumn !== column) {
        cells.push(
          `<rect x="${offset + mirroredColumn * cellSize}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${foreground}"/>`,
        )
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="12" fill="${background}"/><rect x="4" y="4" width="56" height="56" rx="10" fill="rgba(255,255,255,0.38)"/>${cells.join('')}</svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
