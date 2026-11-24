// SVELTEKIT
import { error, json, type RequestHandler } from '@sveltejs/kit'
// DOMAIN
import { interiorContext, floorplanWorker } from '#lib/indoor/floorplans/server.js'
import { premisesMapBucket } from '#lib/indoor/server/storage.js'

/** Submit a PDF/image for review-only extraction and retain its building association.
 * @param event Authenticated bounded source upload. @returns Opaque job identity.
 */
export const POST: RequestHandler = async event => {
  const ctx = await interiorContext(event)
  const max = 30 * 1024 * 1024
  const length = Number(event.request.headers.get('content-length'))
  if (length > max) error(413, 'Use a file smaller than 30 MiB.')
  const reader = event.request.body?.getReader()
  if (!reader) error(400, 'Source file is required.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    size += next.value.length
    if (size > max) {
      await reader.cancel()
      error(413, 'Use a file smaller than 30 MiB.')
    }
    chunks.push(next.value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  const response = await floorplanWorker(event, '/jobs', { method: 'POST', body })
  const job = (await response.json()) as { id: string; sha256: string }
  if (!/^[a-f0-9-]{36}$/.test(job.id) || !/^[a-f0-9]{64}$/.test(job.sha256))
    error(502, 'Invalid extraction receipt.')
  const bucket = premisesMapBucket(event.locals.platform)
  await bucket.put(`interior-jobs/${event.params.id}/${job.id}/source`, body)
  await bucket.put(
    `interior-jobs/${event.params.id}/${job.id}/receipt.json`,
    JSON.stringify({
      ...job,
      actorId: ctx.user.id,
      createdAt: new Date().toISOString(),
    }),
  )
  await bucket.put(
    `interior-jobs/${event.params.id}/active.json`,
    JSON.stringify({ id: job.id }),
  )
  return json(job, { status: 202 })
}

/** Recover the latest job after navigation or a browser restart. @param event Authorized building request. @returns Latest job identity. */
export const GET: RequestHandler = async event => {
  await interiorContext(event)
  const bucket = premisesMapBucket(event.locals.platform)
  const active = await bucket.get(`interior-jobs/${event.params.id}/active.json`)
  return json(active ? await active.json() : { id: null })
}
