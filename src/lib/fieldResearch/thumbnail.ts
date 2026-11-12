/** Create a small map/gallery preview inside the bounded upload worker.
 * @param file Normalized browser-readable image. @returns JPEG preview, with decode memory released.
 */
export async function createResearchThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image preview could not be created')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        blob =>
          blob ? resolve(blob) : reject(new Error('Image preview encoding failed')),
        'image/jpeg',
        0.8,
      ),
    )
  } finally {
    bitmap.close()
  }
}
