// TYPES

/* ----------------- */
// PREVIEWS
/* -------- */

export type PreviewStage = 'local' | 'preview' | 'production'

export type MapRenderAssetKind = 'styles' | 'layers' | 'projects'

export type MapRenderPersistenceTarget = 'local' | 'remote'

export type MapRenderRemoteConfig = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
}

export type MapRenderManifestEntry = {
  fileName: string
  publicPath: string
  objectKey: string
  publicUrl: string
  hash: string
  sourceUrl: string
}

export type MapRenderJob = {
  kind: MapRenderAssetKind
  identifier: string
  hash: string
  sourceUrl: string
  targetObjectKey: string
}

export type AssetRenderJob = {
  env: PreviewStage
  publicId: string
  version?: number
}
