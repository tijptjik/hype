// TOC: R2 manifest preparation

/**
 * Records the deployed R2 object's actual ETag without changing graph identity.
 * @returns Completion after validating size and updating only the local manifest.
 * @remarks Upload graph.tar/config.json first, then run this and upload manifest.json.
 */
async function main(): Promise<void> {
  const token = process.env.BENCHMARK_TOKEN
  if (!token) throw new Error('BENCHMARK_TOKEN required')
  const response = await fetch(
    'https://hype-routing-wasm-benchmark.hypehk.workers.dev/dataset',
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  if (!response.ok) throw new Error(`Metadata request failed: ${response.status}`)
  const result = (await response.json()) as {
    archive: { size: number; etag: string } | null
  }
  const path = 'build/routing-benchmark/datasets/hk-2026-10-01/manifest.json'
  const manifest = await Bun.file(path).json()
  if (!result.archive || result.archive.size !== Number(manifest.archive.size))
    throw new Error('Archive size mismatch')
  manifest.archive.etag = result.archive.etag
  await Bun.write(path, JSON.stringify(manifest, null, 2) + '\n')
  console.log('Validated archive size and prepared the local manifest ETag.')
}

if (import.meta.main) await main()
