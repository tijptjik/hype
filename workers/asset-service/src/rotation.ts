/**
 * Rotates decoded pixels for delivery without modifying the stored source.
 * @param image Decoded source pixels after EXIF orientation.
 * @param rotation Clockwise quarter turn recorded in delivery metadata.
 * @returns Rotated pixels, or the original buffer for no rotation.
 */
export function rotatePixels(image: ImageData, rotation: number): ImageData {
  if (![90, 180, 270].includes(rotation)) return image
  const width = rotation === 180 ? image.width : image.height
  const height = rotation === 180 ? image.height : image.width
  const pixels = new Uint8ClampedArray(image.data.length)
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const targetX =
        rotation === 90
          ? image.height - 1 - y
          : rotation === 180
            ? image.width - 1 - x
            : y
      const targetY =
        rotation === 90
          ? x
          : rotation === 180
            ? image.height - 1 - y
            : image.width - 1 - x
      const offset = (y * image.width + x) * 4
      pixels.set(
        image.data.subarray(offset, offset + 4),
        (targetY * width + targetX) * 4,
      )
    }
  }
  return new ImageData(pixels, width, height)
}
