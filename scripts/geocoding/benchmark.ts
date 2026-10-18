// RUNTIME
import { parseArgs } from 'node:util'
// THIRD PARTY
import { z } from 'zod'

// TOC: Contracts | Scoring | Live benchmark

const candidateSchema = z.object({
  type: z.literal('geocoding-results'),
  attributes: z
    .object({
      status: z.string(),
      coordinates: z.tuple([z.number(), z.number()]).optional(),
    })
    .passthrough(),
  relationships: z
    .object({
      address: z
        .object({
          data: z.array(z.object({ type: z.literal('addresses'), id: z.string() })),
        })
        .optional(),
    })
    .passthrough(),
})
const responseSchema = z.object({
  data: z.array(candidateSchema),
  included: z
    .array(
      z.object({
        type: z.string(),
        id: z.string(),
        attributes: z
          .object({
            geometry: z
              .object({
                type: z.literal('Point'),
                coordinates: z.tuple([z.number(), z.number()]),
              })
              .nullable()
              .optional(),
            i18n: z
              .record(
                z.string(),
                z.object({ formattedAddress: z.string().optional() }).passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      }),
    )
    .optional(),
  meta: z.unknown().optional(),
})
const fixtureSchema = z.object({
  places: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      googleAddress: z.string(),
      addressCore: z.string(),
      coordinates: z.tuple([z.number(), z.number()]),
    }),
  ),
})

type Coordinate = [number, number]
type Candidate = {
  status: string
  addressId: string | null
  addresses: Record<string, string>
  distanceToGoogleMetres: number | null
}
type Assessment = {
  outcome: 'results' | 'no_match' | 'incomplete' | 'http_error' | 'invalid_response'
  httpStatus: number
  candidates: Candidate[]
  top1Within50m: boolean | null
  top1Within100m: boolean | null
  top5Within100m: boolean | null
}

/**
 * Measures great-circle separation from a Google POI reference pin.
 * @param a First WGS84 [longitude, latitude] pair.
 * @param b Second WGS84 [longitude, latitude] pair.
 * @returns Distance in metres; proximity does not establish address identity.
 */
export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371008.8 * Math.asin(Math.sqrt(Math.min(1, h)))
}

/**
 * Resolves address relationships and scores returned coordinate proximity.
 * @param httpStatus HTTP status of the geocoder response.
 * @param body Parsed JSON response (or text when JSON decoding failed).
 * @param reference Google Maps POI pin in WGS84 [longitude, latitude].
 * @returns Candidate evidence and proximity flags, with unavailable service distinct from no match.
 * @remarks Address equivalence needs manual review of street, number and building.
 */
export function assessResponse(
  httpStatus: number,
  body: unknown,
  reference: Coordinate,
): Assessment {
  const empty = {
    httpStatus,
    candidates: [],
    top1Within50m: null,
    top1Within100m: null,
    top5Within100m: null,
  }
  if (httpStatus < 200 || httpStatus >= 300) return { ...empty, outcome: 'http_error' }
  const parsed = responseSchema.safeParse(body)
  if (!parsed.success) return { ...empty, outcome: 'invalid_response' }

  // Follow JSON:API relationships and score address geometry; result coordinates may echo the input pin.
  const candidates: Candidate[] = parsed.data.data.flatMap(result => {
    const link = result.relationships.address?.data[0]
    if (!link) return []
    const resource = parsed.data.included?.find(
      item => item.type === link.type && item.id === link.id,
    )
    return [
      {
        status: result.attributes.status,
        addressId: link.id,
        addresses: Object.fromEntries(
          Object.entries(resource?.attributes.i18n ?? {}).flatMap(([locale, value]) =>
            value.formattedAddress ? [[locale, value.formattedAddress]] : [],
          ),
        ),
        distanceToGoogleMetres: resource?.attributes.geometry?.coordinates
          ? distanceMetres(reference, resource.attributes.geometry.coordinates)
          : null,
      },
    ]
  })
  if (!candidates.length) {
    if (parsed.data.data.some(result => result.attributes.status === 'incomplete')) {
      return { ...empty, outcome: 'incomplete' }
    }
    const noMatch =
      !parsed.data.data.length ||
      parsed.data.data.every(result =>
        ['not_found', 'incomplete'].includes(result.attributes.status),
      )
    return { ...empty, outcome: noMatch ? 'no_match' : 'invalid_response' }
  }
  const first = candidates[0].distanceToGoogleMetres
  const distances = candidates
    .slice(0, 5)
    .flatMap(candidate =>
      candidate.distanceToGoogleMetres === null
        ? []
        : [candidate.distanceToGoogleMetres],
    )
  return {
    httpStatus,
    candidates,
    outcome: 'results',
    top1Within50m: first === null ? null : first <= 50,
    top1Within100m: first === null ? null : first <= 100,
    top5Within100m: distances.length
      ? distances.some(distance => distance <= 100)
      : null,
  }
}

/**
 * Runs the fixed sample against one endpoint and writes evidence without credentials.
 * @returns Resolves after the result artifact is written.
 * @remarks Stops on the first access or response-contract failure; service errors can be
 * retried and recorded with --continue-service-errors. Skipped queries
 * are not counted as failed geocodes. API keys are read only from the named process variable.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'http://api.atlas.localhost' },
      origin: { type: 'string', default: 'http://hype.localhost' },
      fixture: {
        type: 'string',
        default: 'docs/benchmarks/geocoder-florists-2026-10-18.json',
      },
      output: { type: 'string', default: '/tmp/geocoder-florists-results.json' },
      'key-env': { type: 'string' },
      resume: { type: 'string' },
      'continue-service-errors': { type: 'boolean', default: false },
    },
  })
  const fixture = fixtureSchema.parse(await Bun.file(values.fixture!).json())
  const headers: Record<string, string> = {
    Origin: values.origin!,
    Accept: 'application/vnd.api+json',
  }
  if (values['key-env']) {
    const key = process.env[values['key-env']]
    if (!key) throw new Error('The requested API-key environment variable is empty')
    headers['x-api-key'] = key
  }
  const prior = values.resume
    ? z
        .object({
          base: z.string(),
          origin: z.string(),
          results: z.array(
            z
              .object({
                query: z.string().optional(),
                httpStatus: z.number().optional(),
                outcome: z.string(),
              })
              .passthrough(),
          ),
        })
        .parse(await Bun.file(values.resume).json())
    : null
  if (prior && (prior.base !== values.base || prior.origin !== values.origin))
    throw new Error('Resume endpoint/origin must match')
  let reusedQueries = 0
  const results: unknown[] = []
  let blocked = false
  let serviceFailures = 0

  // Preserve raw listing, simplified-address and reverse-pin queries as separate experiments.
  for (const place of fixture.places) {
    const cases: Array<[string, Record<string, string>]> = [
      [
        'reverse',
        { lng: String(place.coordinates[0]), lat: String(place.coordinates[1]) },
      ],
      ['forward_raw', { address: place.googleAddress }],
      ['forward_core', { address: place.addressCore }],
    ]
    for (const [mode, input] of cases) {
      const url = new URL('/addresses/v1/geocode', values.base)
      url.search = new URLSearchParams({
        ...input,
        profile: 'map',
        locales: 'en,zh-hant,zh-hans',
        limit: '5',
        maxDistance: '1000',
      }).toString()
      const previous = prior?.results.find(
        result =>
          result.query === url.toString() &&
          result.httpStatus === 200 &&
          result.outcome !== 'invalid_response',
      )
      if (previous) {
        results.push(previous)
        reusedQueries++
        continue
      }
      const started = performance.now()
      try {
        let response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) })
        const attempts = [response.status]
        // Retry transient service failures at most twice without hiding them from the evidence.
        while (
          values['continue-service-errors'] &&
          response.status === 503 &&
          attempts.length < 3
        ) {
          await response.body?.cancel()
          await Bun.sleep(1000)
          response = await fetch(url, { headers, signal: AbortSignal.timeout(45000) })
          attempts.push(response.status)
        }
        const text = await response.text()
        let body: unknown
        try {
          body = JSON.parse(text)
        } catch {
          body = text
        }
        const assessment = assessResponse(response.status, body, place.coordinates)
        results.push({
          id: place.id,
          mode,
          query: url.toString(),
          attempts,
          durationMs: Math.round(performance.now() - started),
          ...assessment,
          body,
          addressIdentityReview: 'pending',
        })
        const serviceFailure =
          response.status === 503 && values['continue-service-errors']
        if (serviceFailure) serviceFailures++
        blocked =
          !serviceFailure &&
          ['http_error', 'invalid_response'].includes(assessment.outcome)
        console.log(
          `${place.id} ${mode}: HTTP ${response.status} ${assessment.outcome}`,
        )
      } catch {
        results.push({ id: place.id, mode, outcome: 'network_error' })
        serviceFailures++
        blocked = !values['continue-service-errors']
      }
      if (blocked) break
    }
    if (blocked) break
  }
  await Bun.write(
    values.output!,
    `${JSON.stringify(
      {
        runAt: new Date().toISOString(),
        base: values.base,
        origin: values.origin,
        keyProvided: Boolean(values['key-env']),
        fixture: values.fixture,
        status: blocked
          ? 'blocked'
          : serviceFailures
            ? 'complete_with_service_failures'
            : 'complete',
        serviceFailures,
        resumedFrom: values.resume ?? null,
        reusedQueries,
        requestedQueries: results.length - reusedQueries,
        plannedQueries: fixture.places.length * 3,
        attemptedQueries: results.length,
        unattemptedQueries: fixture.places.length * 3 - results.length,
        results,
      },
      null,
      2,
    )}\n`,
  )
  if (blocked || serviceFailures) process.exitCode = 2
}

if (import.meta.main) await main()
