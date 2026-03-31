import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

type ProbeTarget = {
  cloudName: string
  id: string
  newPublicId: string
  originalExtension: string
  version: number
}

type AttemptResult = {
  attempt: number
  status: number | null
  url: string
  ok: boolean
  error?: string
}

type ProbeResult = {
  id: string
  newPublicId: string
  legacyPublicId: string
  success: boolean
  attempts: AttemptResult[]
  downloadedFrom?: string
  outputPath?: string
}

const DEFAULT_OUT_DIR = path.join('tmp', 'hkghostsigns-r2-cutover')
const DEFAULT_REPORT_PATH = path.join(DEFAULT_OUT_DIR, 'report.json')
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_RETRIES = 3

const CLOUDINARY_BASE_URL = 'https://res.cloudinary.com'

const TARGETS: ProbeTarget[] = [
  {
    cloudName: 'dg6vtsga1',
    id: 'rbtf2nAutWbD',
    newPublicId: 'h/hkghostsigns/hkghostsigns/vtqnchcozi2wzkkdn8si',
    originalExtension: 'webp',
    version: 1749192959,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'Emo1qZeR2fix',
    newPublicId: 'h/hkghostsigns/hkghostsigns/cgxqmp81tgcwit7r5xwe',
    originalExtension: 'webp',
    version: 1749193009,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'z465Fx-tV6ky',
    newPublicId: 'h/hkghostsigns/hkghostsigns/gi6yzkmhwgvmnnphqg5w',
    originalExtension: 'webp',
    version: 1749193164,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'NG4rx4Qey2lL',
    newPublicId: 'h/hkghostsigns/hkghostsigns/if560wj5ivj4brzwamhd',
    originalExtension: 'webp',
    version: 1749193165,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'U5K-MUH2Ld_c',
    newPublicId: 'h/hkghostsigns/hkghostsigns/nfetjirhb4nypr5jjpd4',
    originalExtension: 'webp',
    version: 1749195146,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'nu7YYEzeLb7S',
    newPublicId: 'h/hkghostsigns/hkghostsigns/kzb3zlb5ucjx23uaacpd',
    originalExtension: 'webp',
    version: 1752570674,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'BqmTGq5Hx89b',
    newPublicId: 'h/hkghostsigns/hkghostsigns/zycvvvaq0vkmeysd4nhy',
    originalExtension: 'jpg',
    version: 1753860872,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'FB-VirrVd07I',
    newPublicId: 'h/hkghostsigns/hkghostsigns/tkzh1tpvcv97cqeqahzq',
    originalExtension: 'jpg',
    version: 1753869983,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'qSXpuWSt1ODH',
    newPublicId: 'h/hkghostsigns/hkghostsigns/iny0ds8emizyxcaglrb7',
    originalExtension: 'jpg',
    version: 1754187906,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'EFsm8Tt0FbYa',
    newPublicId: 'h/hkghostsigns/hkghostsigns/lllxxd4mau79alcruzr9',
    originalExtension: 'jpg',
    version: 1754188031,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'wSv7huaEFOVd',
    newPublicId: 'h/hkghostsigns/hkghostsigns/nuao2r1icfypsmcej6xd',
    originalExtension: 'webp',
    version: 1754628243,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'wEFlKQ0Ta-Xq',
    newPublicId: 'h/hkghostsigns/hkghostsigns/lbycnrydx0yxoubbqovt',
    originalExtension: 'webp',
    version: 1754629057,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'skQ0gTJUF1hc',
    newPublicId: 'h/hkghostsigns/hkghostsigns/m2eqlxijivvxgx5g2xsr',
    originalExtension: 'jpg',
    version: 1754629057,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 's-Jnqf7jCJNl',
    newPublicId: 'h/hkghostsigns/hkghostsigns/qdrx71qbe1vtxgvdwjvm',
    originalExtension: 'webp',
    version: 1754629057,
  },
  {
    cloudName: 'dg6vtsga1',
    id: '-2hdzuT4PPWs',
    newPublicId: 'h/hkghostsigns/hkghostsigns/qutosf9babho4z52rty5',
    originalExtension: 'jpg',
    version: 1774499916,
  },
  {
    cloudName: 'dg6vtsga1',
    id: '_tnyy6Tqcc-5',
    newPublicId: 'h/hkghostsigns/hkghostsigns/ehgai07gz70cqmpu9d48',
    originalExtension: 'jpg',
    version: 1774499919,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'EwC2kkxvu9cX',
    newPublicId: 'h/hkghostsigns/hkghostsigns/bskgeldcxxjbyiuegrzr',
    originalExtension: 'jpg',
    version: 1774499922,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'oDZHWN9wlVYb',
    newPublicId: 'h/hkghostsigns/hkghostsigns/ebdk4mafjxeq0e2cg2vh',
    originalExtension: 'jpg',
    version: 1774583999,
  },
  {
    cloudName: 'dg6vtsga1',
    id: 'zvl3tx9c6UU2',
    newPublicId: 'h/hkghostsigns/hkghostsigns/n8djzjzuvknfkcozomqi',
    originalExtension: 'jpg',
    version: 1774584003,
  },
]

/**
 * Parses optional CLI flags.
 *
 * @param argv Raw CLI args after the script path.
 * @returns Normalized probe options.
 */
const parseArgs = (argv: string[]): {
  outDir: string
  reportPath: string
  retries: number
  timeoutMs: number
} => {
  let outDir = DEFAULT_OUT_DIR
  let reportPath = DEFAULT_REPORT_PATH
  let retries = DEFAULT_RETRIES
  let timeoutMs = DEFAULT_TIMEOUT_MS

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    switch (arg) {
      case '--out-dir':
        outDir = argv[index + 1] ?? outDir
        index += 1
        break
      case '--report':
        reportPath = argv[index + 1] ?? reportPath
        index += 1
        break
      case '--retries':
        retries = Number.parseInt(argv[index + 1] ?? '', 10) || retries
        index += 1
        break
      case '--timeout-ms':
        timeoutMs = Number.parseInt(argv[index + 1] ?? '', 10) || timeoutMs
        index += 1
        break
      default:
        break
    }
  }

  return { outDir, reportPath, retries, timeoutMs }
}

/**
 * Builds the candidate Cloudinary source URLs to probe for a given image row.
 *
 * @param target Probe target metadata.
 * @returns Candidate Cloudinary delivery URLs.
 */
const buildCandidateUrls = (target: ProbeTarget): string[] => {
  const legacyPublicId = target.newPublicId.replace(/^h\//, '')
  const versionSegment = `v${target.version}`
  const versionedBase = `${CLOUDINARY_BASE_URL}/${target.cloudName}/image/upload/${versionSegment}/${legacyPublicId}`
  const unversionedBase = `${CLOUDINARY_BASE_URL}/${target.cloudName}/image/upload/${legacyPublicId}`

  return [
    versionedBase,
    `${versionedBase}.${target.originalExtension}`,
    unversionedBase,
    `${unversionedBase}.${target.originalExtension}`,
  ]
}

/**
 * Infers an output extension from the response content type.
 *
 * @param contentType HTTP content type header.
 * @returns Extension without the leading dot.
 */
const toExtension = (contentType: string | null): string => {
  const normalized = contentType?.split(';', 1)[0].trim().toLowerCase() ?? ''

  switch (normalized) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/avif':
      return 'avif'
    case 'image/gif':
      return 'gif'
    case 'image/tiff':
      return 'tiff'
    default:
      return 'bin'
  }
}

/**
 * Waits before the next retry.
 *
 * @param ms Delay in milliseconds.
 * @returns Nothing.
 */
const sleep = async (ms: number): Promise<void> =>
  await new Promise(resolve => setTimeout(resolve, ms))

/**
 * Attempts to download one image from the candidate endpoints.
 *
 * @param target Probe target metadata.
 * @param outDir Output directory for successful binaries.
 * @param retries Maximum tries per URL.
 * @param timeoutMs Per-request timeout.
 * @returns Final probe result.
 */
const probeTarget = async (
  target: ProbeTarget,
  outDir: string,
  retries: number,
  timeoutMs: number,
): Promise<ProbeResult> => {
  const legacyPublicId = target.newPublicId.replace(/^h\//, '')
  const attempts: AttemptResult[] = []

  for (const url of buildCandidateUrls(target)) {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
        })

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer()
          const extension = toExtension(response.headers.get('content-type'))
          const outputPath = path.join(outDir, `${target.id}.${extension}`)
          await writeFile(outputPath, new Uint8Array(arrayBuffer))
          const outputStat = await stat(outputPath)

          attempts.push({
            attempt,
            status: response.status,
            url,
            ok: true,
          })

          console.log(
            `[probe] success id=${target.id} bytes=${outputStat.size} url=${url}`,
          )

          return {
            id: target.id,
            newPublicId: target.newPublicId,
            legacyPublicId,
            success: true,
            attempts,
            downloadedFrom: url,
            outputPath,
          }
        }

        attempts.push({
          attempt,
          status: response.status,
          url,
          ok: false,
        })

        console.warn(
          `[probe] miss id=${target.id} attempt=${attempt} status=${response.status} url=${url}`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        attempts.push({
          attempt,
          status: null,
          url,
          ok: false,
          error: message,
        })

        console.warn(
          `[probe] error id=${target.id} attempt=${attempt} url=${url} error=${message}`,
        )
      } finally {
        clearTimeout(timeout)
      }

      if (attempt < retries) {
        await sleep(500 * attempt)
      }
    }
  }

  return {
    id: target.id,
    newPublicId: target.newPublicId,
    legacyPublicId,
    success: false,
    attempts,
  }
}

/**
 * Runs the probe for every requested image and writes a report.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))

  await rm(options.outDir, { recursive: true, force: true })
  await mkdir(options.outDir, { recursive: true })
  await mkdir(path.dirname(options.reportPath), { recursive: true })

  const results: ProbeResult[] = []

  for (const target of TARGETS) {
    results.push(
      await probeTarget(target, options.outDir, options.retries, options.timeoutMs),
    )
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      requested: TARGETS.length,
      survivors: results.filter(result => result.success).length,
      missing: results.filter(result => !result.success).length,
    },
    survivors: results
      .filter(result => result.success)
      .map(result => ({
        id: result.id,
        newPublicId: result.newPublicId,
        legacyPublicId: result.legacyPublicId,
        downloadedFrom: result.downloadedFrom,
        outputPath: result.outputPath,
      })),
    missing: results
      .filter(result => !result.success)
      .map(result => ({
        id: result.id,
        newPublicId: result.newPublicId,
        legacyPublicId: result.legacyPublicId,
      })),
    results,
  }

  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`)

  console.log(
    `[probe] complete requested=${report.totals.requested} survivors=${report.totals.survivors} missing=${report.totals.missing} report=${options.reportPath}`,
  )
}

await main()
