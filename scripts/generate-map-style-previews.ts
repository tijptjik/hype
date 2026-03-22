import { listMapStyleDefinitions } from '../src/lib/map/styles'
import { generateAllMapStylePreviewsLocally } from '../src/lib/map/styles/preview.local.server'
import { MAP_STYLE_PREVIEW_BASE_URL } from '../src/lib/map/styles/preview.shared'

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
  }

  return next
}

const main = async (): Promise<void> => {
  const baseUrl = process.env.MAP_STYLE_PREVIEW_BASE_URL ?? MAP_STYLE_PREVIEW_BASE_URL
  const styleCodes = shuffle(
    listMapStyleDefinitions().map(definition => definition.key),
  )
  const force = process.argv.includes('--force')
  const startedAt = Date.now()

  console.log(
    `[map:styles:preview] ${force ? 'Rebuilding' : 'Refreshing'} ${styleCodes.length} map style previews from ${baseUrl}`,
  )
  console.log(`[map:styles:preview] Order: ${styleCodes.join(', ')}`)

  const previews = await generateAllMapStylePreviewsLocally(styleCodes, {
    baseUrl,
    ensureArtifacts: true,
    force,
    onProgress: ({ styleCode, index, total, stage, entry }) => {
      if (stage === 'started') {
        console.log(`[map:styles:preview] [${index}/${total}] Rendering ${styleCode}...`)
        return
      }

      console.log(
        `[map:styles:preview] [${index}/${total}] Completed ${styleCode} -> ${entry?.objectKey ?? 'unknown'}`,
      )
    },
  })

  console.log(
    `[map:styles:preview] Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (${Object.keys(previews).length} previews)`,
  )
}

await main()
