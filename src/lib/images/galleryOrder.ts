// DOMAIN
import { DEFAULT_IMAGE_INTENTS } from './intents'

export type GallerySortMode = 'automatic' | 'manual'
export type GallerySortItem = {
  id: string
  intent?: string | null
  createdAt?: string | null
  galleryPosition?: number
  gallerySortMode?: GallerySortMode
}

/** Orders images using the gallery's explicit mode and current intent catalogue.
 * @param items Visible images, including any newly attached images.
 * @param mode Missing historical modes mean automatic ordering.
 * @param intentOrder Effective intent identities in display order.
 * @returns A sorted copy; unpositioned additions follow positioned images in manual mode.
 * @remarks Equal automatic keys retain their input order. Removed intent identities sort last.
 */
export function orderGallery<T extends GallerySortItem>(
  items: readonly T[],
  mode: GallerySortMode = 'automatic',
  intentOrder: readonly string[] = DEFAULT_IMAGE_INTENTS.map(intent => intent.id),
): T[] {
  const rank = (intent: string | null | undefined): number => {
    const index = intentOrder.indexOf(intent ?? 'undefined')
    return index < 0 ? intentOrder.length : index
  }
  return [...items].sort((a, b) => {
    if (mode === 'manual')
      return (
        (a.galleryPosition ?? Number.MAX_SAFE_INTEGER) -
        (b.galleryPosition ?? Number.MAX_SAFE_INTEGER)
      )
    const byIntent = rank(a.intent) - rank(b.intent)
    if (byIntent) return byIntent
    return (Date.parse(b.createdAt ?? '') || 0) - (Date.parse(a.createdAt ?? '') || 0)
  })
}

/** Prioritizes photos awaiting classification in automatic editor and review rails.
 * @param items Visible gallery items. @param mode Explicit gallery mode.
 * @param intentOrder Effective catalogue order for classified photos.
 * @returns A sorted copy; deliberate manual positions remain authoritative.
 * @remarks This is an editing affordance, not a change to public gallery intent priority.
 */
export function orderGalleryForReview<T extends GallerySortItem>(
  items: readonly T[],
  mode: GallerySortMode = 'automatic',
  intentOrder: readonly string[] = DEFAULT_IMAGE_INTENTS.map(intent => intent.id),
): T[] {
  return orderGallery(items, mode, [
    'undefined',
    ...intentOrder.filter(intent => intent !== 'undefined'),
  ])
}
