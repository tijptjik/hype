import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Plugin } from 'vite'

import { listMapStyleAssetRecords } from './registry'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ARTIFACT BUILDING
//    - buildMapStyleArtifacts
//
// 2. VITE INTEGRATION
//    - mapStyleArtifactsPlugin

const OUTPUT_DIR = path.resolve('static/mapStyles')

/**
 * Rebuilds static JSON artifacts for every registered built-in map style.
 *
 * @returns Nothing.
 */
export const buildMapStyleArtifacts = async (): Promise<void> => {
  const assets = await listMapStyleAssetRecords()

  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_DIR, { recursive: true })

  await Promise.all(
    assets.map(asset =>
      writeFile(path.join(OUTPUT_DIR, asset.fileName), asset.json, 'utf8'),
    ),
  )

  const manifest = Object.fromEntries(
    assets.map(asset => [
      asset.key,
      {
        fileName: asset.fileName,
        publicPath: asset.publicPath,
        hash: asset.hash,
      },
    ]),
  )

  await writeFile(
    path.join(OUTPUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
}

/**
 * Vite plugin that keeps generated map-style artifacts in sync during build and dev.
 *
 * @returns Configured Vite plugin instance.
 */
export const mapStyleArtifactsPlugin = (): Plugin => {
  let isBuilding = false

  const rebuild = async () => {
    if (isBuilding) {
      return
    }

    // Serialize rebuilds so watcher bursts do not interleave writes into the output dir.
    isBuilding = true

    try {
      await buildMapStyleArtifacts()
    } finally {
      isBuilding = false
    }
  }

  return {
    name: 'hype-map-style-artifacts',
    async buildStart() {
      await rebuild()
    },
    configureServer(server) {
      server.watcher.add(path.resolve('src/lib/map/styles'))
      server.watcher.on('change', async changedFile => {
        if (
          !changedFile.includes(
            `${path.sep}src${path.sep}lib${path.sep}map${path.sep}styles${path.sep}`,
          )
        ) {
          return
        }
        if (changedFile.includes(`${path.sep}static${path.sep}mapStyles${path.sep}`)) {
          return
        }

        await rebuild()
      })
    },
  }
}
