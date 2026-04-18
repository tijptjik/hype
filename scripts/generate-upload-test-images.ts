import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

type RasterFormat =
  | 'avif'
  | 'gif'
  | 'heic'
  | 'jpeg'
  | 'jxl'
  | 'png'
  | 'tiff'
  | 'webp'
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

type OutputPlan = {
  formats: readonly OutputFormat[]
  notes: string[]
}

type HeicEncoder = 'magick' | 'sharp'

type SourcePlan = {
  buffer: Buffer
  notes: string[]
}

type JxlEncoder = 'magick'

const ALWAYS_SUPPORTED_OUTPUT_FORMATS: readonly OutputFormat[] = [
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
  heic: 'HEIC',
  jpeg: 'JPEG',
  jxl: 'JXL',
  png: 'PNG',
  tiff: 'TIFF',
  webp: 'WEBP',
}

const SVG_FORMAT_LABEL = 'SVG'
const execFileAsync = promisify(execFile)

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// CLI
// - parseArgs
//
// IMAGE
// - createBasePipeline
// - createOutputPlan
// - loadSourcePlan
// - createTextOverlaySvg
// - createAnnotatedRasterBuffer
// - createSvgOutput
// - detectHeicEncoder
// - detectJxlEncoder
// - encodeHeicWithNativeTool
// - encodeJxlWithNativeTool
// - decodeImageWithNativeTool
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
      : path.resolve('tmp', baseName),
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
 * Resolves which output formats the current image toolchain can actually encode.
 *
 * @returns Output formats plus manifest notes for any skipped variants.
 */
const createOutputPlan = async (): Promise<OutputPlan> => {
  const notes: string[] = []
  const formats = [...ALWAYS_SUPPORTED_OUTPUT_FORMATS]
  const heicEncoder = await detectHeicEncoder()
  const jxlEncoder = await detectJxlEncoder()

  if (heicEncoder) {
    formats.push('heic')

    if (heicEncoder === 'magick') {
      notes.push(
        'HEIC fixtures were generated via ImageMagick because Sharp HEVC encoding is unavailable in this environment.',
      )
    }
  } else {
    notes.push(
      'HEIC/HEIF uploads are accepted by the app upload normalization flow, but this machine cannot encode HEIC fixtures because neither Sharp HEVC output nor an ImageMagick HEIC encoder is available here.',
    )
  }

  if (jxlEncoder) {
    formats.push('jxl')
    notes.push(
      'JXL fixtures were generated via ImageMagick because the Bun runtime does not reliably execute the browser-focused @jsquash/jxl encoder in this environment.',
    )
  } else {
    notes.push(
      'JXL uploads are accepted by the app upload normalization flow, but this machine cannot encode JXL fixtures because no native ImageMagick JXL encoder is available here.',
    )
  }

  return {
    formats,
    notes,
  }
}

/**
 * Loads the source image bytes, falling back to ImageMagick when Sharp cannot decode them.
 *
 * @param inputPath Absolute source image path.
 * @returns Decodable source bytes plus manifest notes.
 */
const loadSourcePlan = async (inputPath: string): Promise<SourcePlan> => {
  const sourceFile = Bun.file(inputPath)

  if (!(await sourceFile.exists())) {
    throw new Error(`Input image does not exist: ${inputPath}`)
  }

  const sourceBuffer = Buffer.from(await sourceFile.arrayBuffer())
  const ext = path.extname(inputPath).toLowerCase()

  if (ext === '.heic' || ext === '.heif') {
    return {
      buffer: await decodeImageWithNativeTool(inputPath),
      notes: [
        'The HEIC/HEIF source image was decoded via ImageMagick because Sharp cannot reliably rasterize this format in the current environment.',
      ],
    }
  }

  try {
    const metadata = await sharp(sourceBuffer, { animated: false }).metadata()

    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine input image dimensions')
    }

    return {
      buffer: sourceBuffer,
      notes: [],
    }
  } catch {
    throw new Error(`Could not decode input image: ${inputPath}`)
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
  const sizeLabel =
    params.spec.kind === 'original' ? `${width}x${height}` : params.spec.label
  const overlay = createTextOverlaySvg({
    formatLabel: RASTER_FORMAT_LABELS[params.format],
    width,
    height,
    sizeLabel,
  })

  const composited = pipeline.composite([
    {
      input: overlay,
      top: 0,
      left: 0,
    },
  ])

  if (params.format === 'heic') {
    return {
      buffer: await encodeHeicWithNativeTool(await composited.png().toBuffer()),
      width,
      height,
    }
  }

  if (params.format === 'jxl') {
    return {
      buffer: await encodeJxlWithNativeTool(await composited.png().toBuffer()),
      width,
      height,
    }
  }

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
  if (format === 'heic') return 'heic'
  if (format === 'jpeg') return 'jpg'
  return format
}

/**
 * Detects which local encoder can write true HEIC output.
 *
 * @returns Preferred HEIC encoder, if available.
 */
const detectHeicEncoder = async (): Promise<HeicEncoder | null> => {
  if (!sharp.format.heif.output.buffer) {
    return await supportsNativeHeicOutput()
  }

  try {
    await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 3,
        background: {
          r: 255,
          g: 255,
          b: 255,
        },
      },
    })
      .heif({ compression: 'hevc', quality: 80 })
      .toBuffer()

    return 'sharp'
  } catch {
    return await supportsNativeHeicOutput()
  }
}

/**
 * Detects whether ImageMagick can encode JXL in the current environment.
 *
 * @returns Preferred JXL encoder, if available.
 */
const detectJxlEncoder = async (): Promise<JxlEncoder | null> => {
  try {
    const { stdout } = await execFileAsync('magick', ['-list', 'format'])
    return /\bJXL\*?\s+JXL\s+rw\+/u.test(stdout) ? 'magick' : null
  } catch {
    return null
  }
}

/**
 * Detects whether ImageMagick can encode HEIC in the current environment.
 *
 * @returns True when `magick` exposes writable HEIC output.
 */
const supportsNativeHeicOutput = async (): Promise<'magick' | null> => {
  try {
    const { stdout } = await execFileAsync('magick', ['-list', 'format'])
    return /\bHEIC\s+HEIC\s+rw\+/u.test(stdout) ? 'magick' : null
  } catch {
    return null
  }
}

/**
 * Encodes a prepared PNG buffer as HEIC using ImageMagick.
 *
 * @param pngBuffer Annotated PNG buffer to convert.
 * @returns Encoded HEIC bytes.
 */
const encodeHeicWithNativeTool = async (pngBuffer: Buffer): Promise<Buffer> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hype-heic-'))
  const inputPath = path.join(tempDir, 'input.png')
  const outputPath = path.join(tempDir, 'output.heic')

  try {
    await writeFile(inputPath, pngBuffer)
    await execFileAsync('magick', [inputPath, outputPath])
    return await readFile(outputPath)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

/**
 * Encodes a prepared PNG buffer as JXL using ImageMagick.
 *
 * @param pngBuffer Annotated PNG buffer to convert.
 * @returns Encoded JXL bytes.
 */
const encodeJxlWithNativeTool = async (pngBuffer: Buffer): Promise<Buffer> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hype-jxl-'))
  const inputPath = path.join(tempDir, 'input.png')
  const outputPath = path.join(tempDir, 'output.jxl')

  try {
    await writeFile(inputPath, pngBuffer)
    await execFileAsync('magick', [inputPath, outputPath])
    return await readFile(outputPath)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

/**
 * Decodes an image file to PNG bytes using ImageMagick.
 *
 * @param inputPath Absolute path to the source image.
 * @returns PNG bytes suitable for subsequent Sharp processing.
 */
const decodeImageWithNativeTool = async (inputPath: string): Promise<Buffer> => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'hype-source-'))
  const outputPath = path.join(tempDir, 'decoded.png')

  try {
    await execFileAsync('magick', [inputPath, outputPath])
    return await readFile(outputPath)
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
}

/**
 * Generates upload test images for the supported local output formats.
 *
 * @returns Nothing.
 */
const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2))

  await mkdir(options.outputDir, { recursive: true })

  const sourcePlan = await loadSourcePlan(options.inputPath)
  const baseName = path.basename(options.inputPath, path.extname(options.inputPath))
  const outputPlan = await createOutputPlan()
  const outputs: OutputRecord[] = []

  for (const spec of DIMENSION_SPECS) {
    for (const format of outputPlan.formats) {
      const label =
        spec.kind === 'original' ? 'original' : `${spec.size}x${spec.size}`
      const filename = `${baseName}--${label}--${format}.${toExtension(format)}`
      const outputPath = path.join(options.outputDir, filename)
      console.log(`Generating ${filename}`)

      if (format === 'svg') {
        const result = await createSvgOutput({
          source: sourcePlan.buffer,
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
        source: sourcePlan.buffer,
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
          'TIFF is included because the upload normalization path explicitly converts TIFF uploads to JPEG.',
          ...sourcePlan.notes,
          ...outputPlan.notes,
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
        formats: outputPlan.formats,
      },
      null,
      2,
    ),
  )
}

await main()
