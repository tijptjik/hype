// NODE
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

/** Generate synthetic media locally so checks never depend on private temporary files.
 * @returns Absolute directory containing a small WebP tile and two short videos.
 * @remarks Run the parent browser check through dev-check; FFmpeg must be installed.
 */
export async function createMessagingMediaFixtures(): Promise<string> {
  const directory = resolve('output/playwright/messaging-media-fixtures')
  await mkdir(directory, { recursive: true })
  for (const [extension, options] of [
    ['webp', ['-frames:v', '1', '-c:v', 'libwebp']],
    ['mp4', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']],
    ['webm', ['-c:v', 'libvpx']],
  ] as const) {
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=red:s=96x96:r=5:d=1',
      ...options,
      `${directory}/media.${extension}`,
    ])
  }
  return directory
}
