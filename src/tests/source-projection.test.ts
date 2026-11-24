import { expect, it } from 'vitest'
import {
  fetchSaanseoiProjection,
  resolveSourceChunkUrl,
  sourceNameSchema,
} from '../lib/sources/saanseoi'

async function fixture(tamper = false) {
  const records = [1, 2].map(id => ({
    id: String(id),
    names: { en: `Name ${id}`, 'zh-Hant': null, 'zh-Hans': null },
  }))
  const files = await Promise.all(
    records.map(async (row, index) => {
      const data = JSON.stringify([row])
      const sha256 = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)),
        ),
        byte => byte.toString(16).padStart(2, '0'),
      ).join('')
      return {
        format: 'json',
        envelope: 'array',
        href: `https://source.test/${index}?release=one`,
        recordCount: 1,
        byteLength: data.length,
        sha256,
      }
    }),
  )
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    expect(init?.credentials).toBe('omit')
    if (String(url).endsWith('manifest.json'))
      return Response.json({
        schemaVersion: 1,
        family: 'streets',
        projection: 'names',
        status: 'ready',
        apiReleaseSetId: 'one',
        recordCount: 2,
        files: [...files, { ...files[0], format: 'ndjson' }],
      })
    const index = Number(new URL(String(url)).pathname.slice(1))
    return new Response(
      JSON.stringify([{ ...records[index], ...(tamper ? { id: 'x' } : {}) }]),
    )
  }) as typeof fetch
  return fetcher
}
it('loads all chunks in one format with null translations intact', async () => {
  const result = await fetchSaanseoiProjection(
    'https://source.test/manifest.json',
    sourceNameSchema,
    await fixture(),
  )
  expect(result.records.map(row => row.id)).toEqual(['1', '2'])
  expect(result.records[0].names['zh-Hans']).toBeNull()
})
it('rejects a corrupted chunk before returning any dataset', async () => {
  await expect(
    fetchSaanseoiProjection(
      'https://source.test/manifest.json',
      sourceNameSchema,
      await fixture(true),
    ),
  ).rejects.toThrow('checksum mismatch')
})
it('uses the matching ID shard and rejects a different release', async () => {
  const requests: string[] = []
  const original = await fixture()
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push(String(url))
    const response = await original(url, init)
    if (!String(url).endsWith('manifest.json')) return response
    const manifest = await response.json()
    manifest.exportReleaseId = 'release-one'
    manifest.files = manifest.files.map((file: unknown, index: number) => ({
      ...(file as object),
      minId: String(index + 1),
      maxId: String(index + 1),
    }))
    return Response.json(manifest)
  }) as typeof fetch
  const result = await fetchSaanseoiProjection(
    'https://source.test/manifest.json',
    sourceNameSchema,
    fetcher,
    { id: '2', release: 'release-one' },
  )
  expect(result.records.map(row => row.id)).toEqual(['2'])
  expect(requests).toHaveLength(2)
  await expect(
    fetchSaanseoiProjection(
      'https://source.test/manifest.json',
      sourceNameSchema,
      fetcher,
      { id: '2', release: 'wrong' },
    ),
  ).rejects.toThrow('release mismatch')
})

it('resolves internal exporter links through the local manifest origin', () => {
  const manifest = new URL('http://api.atlas.localhost/buildings/names/manifest.json')
  expect(
    resolveSourceChunkUrl(
      'http://127.0.0.1:8793/buildings/names/chunk.json?release=one',
      manifest,
    ).href,
  ).toBe('http://api.atlas.localhost/buildings/names/chunk.json?release=one')
  for (const href of [
    'https://cdn.example/buildings/names/chunk.json',
    'http://127.0.0.1:8793/other/chunk.json',
  ])
    expect(resolveSourceChunkUrl(href, manifest).href).toBe(href)
  const publicManifest = new URL(
    'https://api.saanseoi.hk/buildings/names/manifest.json',
  )
  const internal = 'http://127.0.0.1:8793/buildings/names/chunk.json'
  expect(resolveSourceChunkUrl(internal, publicManifest).href).toBe(internal)
})
