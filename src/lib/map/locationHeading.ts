// TYPES
import type { GeolocateControl, GeolocatePositionEvent, Marker } from 'maplibre-gl'

const HEADING_MAX_AGE_MS = 15_000

type HeadingPosition = Pick<GeolocatePositionEvent, 'coords' | 'timestamp'>

/**
 * Resolves a fresh direction of travel without inventing a bearing from GPS jitter.
 * @param position - Browser geolocation reading.
 * @param now - Current epoch time in milliseconds.
 * @returns Heading in degrees clockwise from north, or null when unreliable.
 * @remarks A missing speed is allowed; an explicitly stationary fix hides the cue.
 */
export function resolveLocationHeading(
  position: HeadingPosition,
  now = Date.now(),
): number | null {
  const { heading, speed } = position.coords
  if (
    heading === null ||
    !Number.isFinite(heading) ||
    heading < 0 ||
    heading >= 360 ||
    speed === 0 ||
    (speed !== null && (!Number.isFinite(speed) || speed < 0)) ||
    !Number.isFinite(position.timestamp) ||
    now - position.timestamp > HEADING_MAX_AGE_MS
  )
    return null
  return heading
}

/**
 * Adds a quiet travel-direction chevron to the existing geolocation orb (Refs #99).
 * @param control - Mounted MapLibre geolocation control.
 * @returns Cleanup that removes listeners, expiry timer, and the decorative cue.
 * @remarks MapLibre has no heading option. Keep its private dot-marker access isolated
 * here; public Marker methods handle map bearing and pitch without moving the camera.
 */
export function installLocationHeading(control: GeolocateControl): () => void {
  let cue: HTMLSpanElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  /** Hides obsolete travel information and cancels its pending expiry. */
  const hide = (): void => {
    clearTimeout(timer)
    timer = undefined
    if (cue) cue.hidden = true
  }

  /** Updates only the existing dot's decoration after MapLibre positions it. */
  const update = (position: GeolocatePositionEvent): void => {
    hide()
    const heading = resolveLocationHeading(position)
    if (heading === null) return
    // Guard the private adapter so a future MapLibre change fails without a false bearing.
    const marker = (control as GeolocateControl & { _userLocationDotMarker?: Marker })
      ._userLocationDotMarker
    if (!marker) return
    const element = marker.getElement()
    if (!cue || cue.parentElement !== element) {
      cue?.remove()
      cue = element.ownerDocument.createElement('span')
      cue.dataset.locationHeading = ''
      cue.setAttribute('aria-hidden', 'true')
      element.append(cue)
    }
    marker.setRotationAlignment('map').setPitchAlignment('map').setRotation(heading)
    cue.hidden = false
    timer = setTimeout(
      hide,
      Math.max(0, HEADING_MAX_AGE_MS - (Date.now() - position.timestamp)),
    )
  }

  control.on('geolocate', update)
  control.on('error', hide)
  control.on('outofmaxbounds', hide)
  return () => {
    hide()
    control.off('geolocate', update)
    control.off('error', hide)
    control.off('outofmaxbounds', hide)
    cue?.remove()
  }
}
