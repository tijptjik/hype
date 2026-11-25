// SVELTEKIT
import { error, json, type RequestHandler } from '@sveltejs/kit'
// DOMAIN
import { interiorContext, floorplanWorker } from '#lib/indoor/floorplans/server.js'
import { premisesMapStorage } from '#lib/indoor/server/storage.js'
import { floorplanExtractionSchema } from '#lib/indoor/floorplans/extraction.js'

/** Poll only a job associated with this authorized building. @param event Job route. @returns Review candidate and source-page names. */
export const GET: RequestHandler = async event => {
  await interiorContext(event)
  if (!/^[a-f0-9-]{36}$/.test(event.params.job!)) error(404)
  const bucket = premisesMapStorage(event.locals.platform)
  const prefix = `interior-jobs/${event.params.id}/${event.params.job}`
  if (!(await bucket.get(prefix + '/receipt.json'))) error(404)
  const cached = await bucket.get(prefix + '/result.json')
  if (cached) return json(await cached.json())
  const response = await floorplanWorker(event, '/jobs/' + event.params.job)
  const result = (await response.json()) as {
    status: string
    extraction?: unknown
    pages?: string[]
    receipt?: { pages?: [number, number][] }
  }
  if (result.status === 'needs-review') {
    const extraction = floorplanExtractionSchema.parse(result.extraction)
    result.extraction = extraction
    if (
      !result.pages?.length ||
      result.pages.length > 12 ||
      result.receipt?.pages?.length !== result.pages.length
    )
      error(502, 'Invalid source pages')
    for (const floor of extraction.floors) {
      const dimensions = result.receipt.pages[floor.page - 1]
      if (
        !dimensions ||
        dimensions[0] !== floor.width ||
        dimensions[1] !== floor.height
      )
        error(502, 'Extraction dimensions do not match the original page')
    }
    for (const page of result.pages ?? []) {
      if (!/^page-\d+\.png$/.test(page)) error(502, 'Invalid source page')
      const image = await floorplanWorker(event, `/jobs/${event.params.job}/${page}`)
      // R2 requires a known body length; retain bounded page bytes instead of an arbitrary fetch stream.
      const declared = Number(image.headers.get('content-length'))
      if (!declared || declared > 32 * 1024 * 1024)
        error(502, 'Invalid source image size')
      const bytes = await image.arrayBuffer()
      if (bytes.byteLength !== declared) error(502, 'Incomplete source image')
      await bucket.put(prefix + '/' + page, bytes)
    }
    await bucket.put(prefix + '/result.json', JSON.stringify(result))
  }
  return json(result)
}

/** Retry a failed job using its retained original source. @param event Authorized building job. @returns Same job identity. */
export const POST: RequestHandler = async event => {
  await interiorContext(event)
  if (!/^[a-f0-9-]{36}$/.test(event.params.job ?? '')) error(404)
  const bucket = premisesMapStorage(event.locals.platform)
  const prefix = `interior-jobs/${event.params.id}/${event.params.job}`
  if (!(await bucket.get(prefix + '/receipt.json'))) error(404)
  if (await bucket.get(prefix + '/result.json'))
    error(409, 'This extraction is already complete.')
  const response = await floorplanWorker(
    event,
    '/jobs/' + event.params.job + '/retry',
    { method: 'POST' },
  )
  return json(await response.json(), { status: 202 })
}
