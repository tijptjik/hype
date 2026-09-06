// TESTING
import { describe, expect, it } from 'vitest'
// UTILS
import {
  getCapturedAtFromMetadata,
  getCoordinatesFromMetadata,
} from '$lib/utils/image-metadata'
import { extractImageUploadMetadata } from '$lib/images/metadata'

describe('image GPS metadata', () => {
  it('applies southern and western hemisphere references to unsigned coordinates', () => {
    expect(
      getCoordinatesFromMetadata({
        GPSLatitude: '33.9',
        GPSLongitude: '18.4',
        GPSLatitudeRef: 'S',
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({ latitude: '-33.9', longitude: '-18.4' })
  })

  it('does not double-negate coordinates already signed by the EXIF reader', () => {
    expect(
      getCoordinatesFromMetadata({
        GPSLatitude: '-33.9',
        GPSLongitude: '-18.4',
        GPSLatitudeRef: 'S',
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({ latitude: '-33.9', longitude: '-18.4' })
  })

  it('does not return malformed GPS text as coordinates', () => {
    expect(
      getCoordinatesFromMetadata({ GPSLatitude: 'unknown', GPSLongitude: 'unknown' }),
    ).toEqual({ latitude: undefined, longitude: undefined })
  })
})

describe('image capture timestamps', () => {
  it.each([
    ['DateTimeOriginal', 'OffsetTimeOriginal'],
    ['CreateDate', 'OffsetTimeDigitized'],
    ['ModifyDate', 'OffsetTime'],
  ])('uses the timezone offset belonging to %s', (dateField, offsetField) => {
    expect(
      getCapturedAtFromMetadata({
        [dateField]: '2024:01:02 12:30:00',
        [offsetField]: '-05:00',
      }),
    ).toBe('2024-01-02T17:30:00.000Z')
  })

  it('preserves an offset already embedded in a timestamp', () => {
    expect(
      getCapturedAtFromMetadata({
        DateTimeOriginal: '2024-01-02T12:30:00-05:00',
        OffsetTimeOriginal: '+08:00',
      }),
    ).toBe('2024-01-02T17:30:00.000Z')
  })

  it('skips impossible calendar dates instead of rolling into the next month', () => {
    expect(
      getCapturedAtFromMetadata({
        DateTimeOriginal: '2023:02:29 12:30:00',
        CreateDate: '2024-01-02T00:00:00Z',
      }),
    ).toBe('2024-01-02T00:00:00.000Z')
    expect(
      getCapturedAtFromMetadata({ DateTimeOriginal: '2024:02:30 12:30:00' }),
    ).toBeUndefined()
    expect(
      getCapturedAtFromMetadata({ DateTimeOriginal: '2024-02-29T00:00:00Z' }),
    ).toBe('2024-02-29T00:00:00.000Z')
  })

  it('retains timezone tags when extracting an actual TIFF metadata payload', async () => {
    const entries: Array<[number, string]> = [
      [0x9003, '2024:01:02 12:30:00\0'],
      [0x9011, '-05:00\0'],
    ]
    const bytes = new Uint8Array(128)
    const view = new DataView(bytes.buffer)
    bytes.set([0x49, 0x49])
    view.setUint16(2, 42, true)
    view.setUint32(4, 8, true)
    view.setUint16(8, entries.length, true)
    let dataOffset = 8 + 2 + entries.length * 12 + 4
    entries.forEach(([tag, value], index) => {
      const offset = 10 + index * 12
      view.setUint16(offset, tag, true)
      view.setUint16(offset + 2, 2, true)
      view.setUint32(offset + 4, value.length, true)
      view.setUint32(offset + 8, dataOffset, true)
      bytes.set(new TextEncoder().encode(value), dataOffset)
      dataOffset += value.length
    })
    const result = await extractImageUploadMetadata(
      new File([bytes], 'photo.tiff', { type: 'image/tiff' }),
    )
    expect(result.capturedAt).toBe('2024-01-02T17:30:00.000Z')
  })
})
