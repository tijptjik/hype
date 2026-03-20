import { listMapStyleDefinitions } from '../src/lib/map/styles'
import { generateAllMapStylePreviewsLocally } from '../src/lib/map/styles/preview.local.server'
import { MAP_STYLE_PREVIEW_BASE_URL } from '../src/lib/map/styles/preview.shared'

const main = async (): Promise<void> => {
  const baseUrl = process.env.MAP_STYLE_PREVIEW_BASE_URL ?? MAP_STYLE_PREVIEW_BASE_URL

  await generateAllMapStylePreviewsLocally(
    listMapStyleDefinitions().map(definition => definition.key),
    {
      baseUrl,
      ensureArtifacts: true,
    },
  )
}

await main()
