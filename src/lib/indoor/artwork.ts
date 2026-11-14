import { value, type Place } from './model'
export type ShopArtwork = {
  src: string
  aspect: number
  padding: number
  background: string
}
/** Resolves display artwork independently of floor rendering and navigation. @param place Source place. @returns Known artwork or null. */
export function shopArtwork(place?: Place): ShopArtwork | null {
  const occupants = place?.occupants ?? []
  if (occupants.some(o => o.properties.occupant_name_en === '7-Eleven'))
    return {
      src: '/indoor/7eleven.svg',
      aspect: 0.75,
      padding: 0.76,
      background: '#fff',
    }
  if (
    occupants.some(o =>
      /hana[\s-]*musubi/i.test(value(o.properties, 'occupant_name_en')),
    )
  )
    return {
      src: '/indoor/hana-musubi.png',
      aspect: 1,
      padding: 1.25,
      background: '#eb477e',
    }
  return null
}
