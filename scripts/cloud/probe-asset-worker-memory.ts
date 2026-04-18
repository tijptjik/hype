type ImageStage = 'local' | 'preview' | 'production'

type ProbeCase = {
  label: string
  publicId: string
  version?: number
}

type CliOptions = {
  accept: string
  baseUrl: string
  cases: ProbeCase[]
  format: string
  gravity: string
  quality: string
  rawTransformation: string
  requestTimeoutMs: number
  stage: ImageStage
}

const DEFAULT_ACCEPT = 'image/webp,image/avif,image/*;q=0.9,*/*;q=0.8'
const DEFAULT_BASE_URL_BY_STAGE: Record<ImageStage, string> = {
  local: 'http://127.0.0.1:8788',
  preview: 'https://assets.preview.hype.hk',
  production: 'https://assets.hype.hk',
}

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CLI
// - parseCase
// - parseArgs
//
// 2. URLS
// - toTransformPath
//
// 3. PROBING
// - probeCase
//
// 4. ENTRYPOINT
// - main
// ---

/**
 * Parses a case spec in the form `label=publicId` or `label=publicId@version`.
 *
 * @param value Raw CLI value.
 * @returns Parsed case.
 */
const parseCase = (value: string): ProbeCase => {
  const separatorIndex = value.indexOf('=')
  if (separatorIndex <= 0) {
    throw new Error(
      `Invalid --case value: ${value}. Expected label=publicId or label=publicId@version`,
    )
  }

  const label = value.slice(0, separatorIndex).trim()
  const rawPublicId = value.slice(separatorIndex + 1).trim()
  const versionSeparatorIndex = rawPublicId.lastIndexOf('@')

  if (!label || !rawPublicId) {
    throw new Error(`Invalid --case value: ${value}`)
  }

  if (versionSeparatorIndex > 0) {
    const publicId = rawPublicId.slice(0, versionSeparatorIndex)
    const version = Number(rawPublicId.slice(versionSeparatorIndex + 1))

    if (!publicId || !Number.isInteger(version) || version <= 0) {
      throw new Error(`Invalid --case version: ${value}`)
    }

    return { label, publicId, version }
  }

  return { label, publicId: rawPublicId }
}

/**
 * Parses CLI flags for the worker probe.
 *
 * @param argv Raw process args after the script path.
 * @returns Normalized options.
 */
const parseArgs = (argv: string[]): CliOptions => {
  const options: Partial<CliOptions> = {
    accept: DEFAULT_ACCEPT,
    format: 'auto',
    gravity: 'auto',
    quality: 'auto',
    rawTransformation: 'c_fit,h_2160,w_2160',
    requestTimeoutMs: 30000,
    stage: 'preview',
  }
  const cases: ProbeCase[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--accept':
        options.accept = argv[index + 1]
        index += 1
        break
      case '--base-url':
        options.baseUrl = argv[index + 1]
        index += 1
        break
      case '--case':
        cases.push(parseCase(argv[index + 1] ?? ''))
        index += 1
        break
      case '--format':
        options.format = argv[index + 1]
        index += 1
        break
      case '--gravity':
        options.gravity = argv[index + 1]
        index += 1
        break
      case '--quality':
        options.quality = argv[index + 1]
        index += 1
        break
      case '--stage':
        options.stage = argv[index + 1] as ImageStage
        index += 1
        break
      case '--timeout-ms':
        options.requestTimeoutMs = Number.parseInt(argv[index + 1] ?? '', 10)
        index += 1
        break
      case '--transformation':
        options.rawTransformation = argv[index + 1]
        index += 1
        break
      default:
        break
    }
  }

  const stage = options.stage ?? 'preview'
  if (stage !== 'local' && stage !== 'preview' && stage !== 'production') {
    throw new Error(`Invalid --stage value: ${String(stage)}`)
  }

  const requestTimeoutMs = options.requestTimeoutMs ?? 30000
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${String(options.requestTimeoutMs)}`)
  }

  if (cases.length === 0) {
    throw new Error('At least one --case label=publicId[@version] value is required')
  }

  return {
    accept: options.accept ?? DEFAULT_ACCEPT,
    baseUrl:
      (options.baseUrl ?? DEFAULT_BASE_URL_BY_STAGE[stage]).replace(/\/+$/, ''),
    cases,
    format: options.format ?? 'auto',
    gravity: options.gravity ?? 'auto',
    quality: options.quality ?? 'auto',
    rawTransformation: options.rawTransformation ?? 'c_fit,h_2160,w_2160',
    requestTimeoutMs,
    stage,
  }
}

/**
 * Builds a Cloudinary-style worker transform path for the probe request.
 *
 * @param options Probe options.
 * @param probeCase Probe case.
 * @returns Absolute request path.
 */
const toTransformPath = (options: CliOptions, probeCase: ProbeCase): string => {
  const modifiers = [
    options.rawTransformation,
    `g_${options.gravity}`,
    `f_${options.format}`,
    `q_${options.quality}`,
  ].join('/')

  return `/${options.stage}/image/upload/${modifiers}${typeof probeCase.version === 'number' ? `/v${probeCase.version}` : ''}/${probeCase.publicId}`
}

/**
 * Executes one debug HEAD request and prints the most relevant headers.
 *
 * @param options Probe options.
 * @param probeCase Probe case.
 * @returns Nothing.
 */
const probeCase = async (
  options: CliOptions,
  probeCase: ProbeCase,
): Promise<void> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs)
  const path = toTransformPath(options, probeCase)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${options.baseUrl}${path}`, {
      method: 'HEAD',
      headers: {
        accept: options.accept,
        'x-image-debug-memory': '1',
      },
      signal: controller.signal,
    })

    const interestingHeaders = [
      'x-image-cache-status',
      'x-image-debug-failure-phase',
      'x-image-total-ms',
      'x-image-transform-ms',
      'retry-after',
      'content-type',
    ]

    console.log(
      JSON.stringify(
        {
          label: probeCase.label,
          publicId: probeCase.publicId,
          status: response.status,
          statusText: response.statusText,
          durationMs: Date.now() - startedAt,
          path,
          headers: Object.fromEntries(
            interestingHeaders
              .map(name => [name, response.headers.get(name)] as const)
              .filter(([, value]) => value !== null),
          ),
        },
        null,
        2,
      ),
    )
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Runs the requested probe matrix.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))

  console.log(
    JSON.stringify(
      {
        event: 'asset-worker-memory-probe',
        baseUrl: options.baseUrl,
        stage: options.stage,
        transformation: options.rawTransformation,
        gravity: options.gravity,
        format: options.format,
        quality: options.quality,
        cases: options.cases,
      },
      null,
      2,
    ),
  )

  for (const probe of options.cases) {
    await probeCase(options, probe)
  }
}

await main()
