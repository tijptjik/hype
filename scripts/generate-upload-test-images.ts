import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

type RasterFormat = 'avif' | 'gif' | 'jpeg' | 'png' | 'tiff' | 'webp'
type OutputFormat = RasterFormat | 'svg'
type DimensionSpec =
  | {
      kind: 'original'
      label: 'original'
    }
  | {
      kind: 'square'
      label: '2500x2500' | '1000x1000'
      size: number
    }

type CliOptions = {
  inputPath: string
  outputDir: string
}

type OutputRecord = {
  file: string
  format: OutputFormat
  height: number
  label: string
  source: string
  width: number
}

const OUTPUT_FORMATS: readonly OutputFormat[] = [
  'jpeg',
  'png',
  'webp',
  'avif',
  'gif',
  'svg',
  'tiff',
] as const

const DIMENSION_SPECS: readonly DimensionSpec[] = [
  {
    kind: 'original',
    label: 'original',
  },
  {
    kind: 'square',
    label: '2500x2500',
    size: 2500,
  },
  {
    kind: 'square',
    label: '1000x1000',
    size: 1000,
  },
] as const

const RASTER_FORMAT_LABELS: Record<RasterFormat, string> = {
  avif: 'AVIF',
  gif: 'GIF',
  jpeg: 'JPEG',
  png: 'PNG',
  tiff: 'TIFF',
  webp: 'WEBP',
}

const SVG_FORMAT_LABEL = 'SVG'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// CLI
// - parseArgs
//
// IMAGE
// - createBasePipeline
// - createTextOverlaySvg
// - createAnnotatedRasterBuffer
// - createSvgOutput
// - encodeRaster
// - toExtension
//
// MAIN
// - main

/**
 * Parses the CLI arguments.
 *
 * @param argv Raw process arguments after the script path.
 * @returns Normalized input and output paths.
 */
const parseArgs = (argv: string[]): CliOptions => {
  let inputPath: string | null = null
  let outputDir: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--input') {
      inputPath = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (arg === '--output-dir') {
      outputDir = argv[index + 1] ?? null
      index += 1
      continue
    }

    if (!arg.startsWith('--') && !inputPath) {
      inputPath = arg
    }
  }

  if (!inputPath) {
    throw new Error(
      'Missing input image path. Usage: bun run scripts/generate-upload-test-images.ts --input tmp/test.jpg',
    )
  }

  const parsedInputPath = path.resolve(inputPath)
  const baseName = path.basename(parsedInputPath, path.extname(parsedInputPath))

  return {
    inputPath: parsedInputPath,
    outputDir: outputDir
      ? path.resolve(outputDir)
      : path.resolve('tmp', `${baseName}-upload-test-images`),
  }
}

/**
 * Builds the resized image pipeline for one dimension variant.
 *
 * @param source Source image bytes.
 * @param spec Target dimension variant.
 * @returns Sharp pipeline plus final output dimensions.
 */
const createBasePipeline = async (
  source: Buffer,
  spec: DimensionSpec,
): Promise<{
  pipeline: sharp.Sharp
  width: number
  height: number
}> => {
  const metadata = await sharp(source, { animated: false }).metadata()
  const sourceWidth = metadata.width ?? null
  const sourceHeight = metadata.height ?? null

  if (!sourceWidth || !sourceHeight) {
    throw new Error('Could not determine input image dimensions')
  }

  if (spec.kind === 'original') {
    return {
      pipeline: sharp(source, { animated: false }).rotate(),
      width: sourceWidth,
      height: sourceHeight,
    }
  }

  return {
    pipeline: sharp(source, { animated: false }).rotate().resize(spec.size, spec.size, {
      fit: 'cover',
      position: 'centre',
    }),
    width: spec.size,
    height: spec.size,
  }
}

/**
 * Creates a centered SVG overlay with a readable two-line label.
 *
 * @param params Overlay dimensions and text.
 * @returns SVG bytes for Sharp composite.
 */
const createTextOverlaySvg = (params: {
  formatLabel: string
  width: number
  height: number
  sizeLabel: string
}): Buffer => {
  const minDimension = Math.min(params.width, params.height)
  const titleFontSize = Math.max(72, Math.round(minDimension * 0.12))
  const detailFontSize = Math.max(42, Math.round(minDimension * 0.07))
  const boxWidth = Math.round(Math.min(params.width * 0.82, params.width - 80))
  const boxHeight = Math.round(Math.min(params.height * 0.34, params.height - 80))
  const boxX = Math.round((params.width - boxWidth) / 2)
  const boxY = Math.round((params.height - boxHeight) / 2)
  const centerX = Math.round(params.width / 2)
  const centerY = Math.round(params.height / 2)
  const titleY = centerY - Math.round(detailFontSize * 0.45)
  const detailY = centerY + Math.round(detailFontSize * 1.05)

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="12" stdDeviation="18" flood-color="#000000" flood-opacity="0.72" />
        </filter>
      </defs>
      <rect
        x="${boxX}"
        y="${boxY}"
        width="${boxWidth}"
        height="${boxHeight}"
        rx="${Math.round(Math.min(36, minDimension * 0.04))}"
        fill="rgba(0,0,0,0.52)"
        stroke="rgba(255,255,255,0.72)"
        stroke-width="${Math.max(3, Math.round(minDimension * 0.003))}"
        filter="url(#shadow)"
      />
      <text
        x="${centerX}"
        y="${titleY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${titleFontSize}"
        font-weight="800"
        fill="#ffffff"
        stroke="#000000"
        stroke-width="${Math.max(6, Math.round(minDimension * 0.006))}"
        paint-order="stroke"
      >${params.formatLabel}</text>
      <text
        x="${centerX}"
        y="${detailY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${detailFontSize}"
        font-weight="700"
        fill="#ffffff"
        stroke="#000000"
        stroke-width="${Math.max(4, Math.round(minDimension * 0.004))}"
        paint-order="stroke"
      >${params.sizeLabel}</text>
    </svg>
  `.trim()

  return Buffer.from(svg)
}

/**
 * Renders one raster image with the centered format and size label.
 *
 * @param params Output format, source image, and target dimension variant.
 * @returns Encoded output bytes plus final dimensions.
 */
const createAnnotatedRasterBuffer = async (params: {
  format: RasterFormat
  source: Buffer
  spec: DimensionSpec
}): Promise<{
  buffer: Buffer
  width: number
  height: number
}> => {
  const { pipeline, width, height } = await createBasePipeline(params.source, params.spec)
  const overlay = createTextOverlaySvg({
    formatLabel: RASTER_FORMAT_LABELS[params.format],
    width,
    height,
    sizeLabel: params.spec.kind === 'original' ? `${width}x${height}` : params.spec.label,
  })

  const composited = pipeline.composite([
    {
      input: overlay,
      top: 0,
      left: 0,
    },
  ])

  return {
    buffer: await encodeRaster(composited, params.format),
    width,
    height,
  }
}

/**
 * Creates one SVG output that embeds the prepared raster image and the label overlay.
 *
 * @param params Source image and target dimension variant.
 * @returns SVG bytes plus final dimensions.
 */
const createSvgOutput = async (params: {
  source: Buffer
  spec: DimensionSpec
}): Promise<{
  buffer: Buffer
  width: number
  height: number
}> => {
  const { pipeline, width, height } = await createBasePipeline(params.source, params.spec)
  const rasterBase = await pipeline.png().toBuffer()
  const rasterDataUri = `data:image/png;base64,${rasterBase.toString('base64')}`
  const overlay = createTextOverlaySvg({
    formatLabel: SVG_FORMAT_LABEL,
    width,
    height,
    sizeLabel: params.spec.kind === 'original' ? `${width}x${height}` : params.spec.label,
  }).toString('utf8')

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <image href="${rasterDataUri}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" />
      ${overlay.replace(/^<svg[^>]*>/u, '').replace(/<\/svg>$/u, '')}
    </svg>
  `.trim()

  return {
    buffer: Buffer.from(svg),
    width,
    height,
  }
}

/**
 * Encodes a Sharp pipeline into one raster format.
 *
 * @param pipeline Prepared Sharp pipeline.
 * @param format Target output format.
 * @returns Encoded image bytes.
 */
const encodeRaster = async (pipeline: sharp.Sharp, format: RasterFormat): Promise<Buffer> => {
  switch (format) {
    case 'avif':
      return await pipeline.avif({ effort: 1, quality: 50 }).toBuffer()
    case 'gif':
      return await pipeline.gif({ colours: 96, dither: 0.9, effort: 1 }).toBuffer()
    case 'jpeg':
      return await pipeline.jpeg({ mozjpeg: true, quality: 90 }).toBuffer()
    case 'png':
      return await pipeline.png({ compressionLevel: 9 }).toBuffer()
    case 'tiff':
      return await pipeline.tiff({ compression: 'lzw', quality: 90 }).toBuffer()
    case 'webp':
      return await pipeline.webp({ quality: 90 }).toBuffer()
  }
}

/**
 * Returns the file extension for an output format.
 *
 * @param format Target output format.
 * @returns File extension without a leading dot.
 */
const toExtension = (format: OutputFormat): string => {
  if (format === 'jpeg') return 'jpg'
  return format
}

/**
 * Generates upload test images for the supported local output formats.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))
  const sourceFile = Bun.file(options.inputPath)

  if (!(await sourceFile.exists())) {
    throw new Error(`Input image does not exist: ${options.inputPath}`)
  }

  await mkdir(options.outputDir, { recursive: true })

  const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer())
  const baseName = path.basename(options.inputPath, path.extname(options.inputPath))
  const outputs: OutputRecord[] = []

  for (const spec of DIMENSION_SPECS) {
    for (const format of OUTPUT_FORMATS) {
      const label =
        spec.kind === 'original' ? 'original' : `${spec.size}x${spec.size}`
      const filename = `${baseName}--${label}--${format}.${toExtension(format)}`
      const outputPath = path.join(options.outputDir, filename)
      console.log(`Generating ${filename}`)

      if (format === 'svg') {
        const result = await createSvgOutput({
          source: sourceBuffer,
          spec,
        })

        await Bun.write(outputPath, result.buffer)
        outputs.push({
          file: filename,
          format,
          height: result.height,
          label,
          source: options.inputPath,
          width: result.width,
        })
        continue
      }

      const result = await createAnnotatedRasterBuffer({
        format,
        source: sourceBuffer,
        spec,
      })

      await Bun.write(outputPath, result.buffer)
      outputs.push({
        file: filename,
        format,
        height: result.height,
        label,
        source: options.inputPath,
        width: result.width,
      })
    }
  }

  const manifestPath = path.join(options.outputDir, 'manifest.json')
  await Bun.write(
    manifestPath,
    `${JSON.stringify(
      {
        input: options.inputPath,
        outputDir: options.outputDir,
        generatedAt: new Date().toISOString(),
        notes: [
          'All generated filenames include the size and format for metadata inspection.',
          'HEIC and HEIF are accepted by the app upload normalization flow but are not emitted here because the local Sharp toolchain in this repo does not encode those formats.',
          'TIFF is included because the upload normalization path explicitly converts TIFF uploads to JPEG.',
        ],
        outputs,
      },
      null,
      2,
    )}\n`,
  )

  console.log(
    JSON.stringify(
      {
        input: options.inputPath,
        outputDir: options.outputDir,
        generated: outputs.length,
        manifest: manifestPath,
      },
      null,
      2,
    ),
  )
}

await main()
