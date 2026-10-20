// TYPES
import type {
  GeolocateControl,
  GeolocatePositionEvent,
  Map as MapLibreMap,
} from 'maplibre-gl'

type Position = Pick<GeolocatePositionEvent, 'coords' | 'timestamp'>
type ControlAdapter = GeolocateControl & {
  _updateCamera: (position: GeolocationPosition) => void
  _onMoveStart: (event: object) => void
  _geolocateButton: HTMLButtonElement
}

/**
 * Determines whether a fix is suitable for automatic startup centering.
 * @param position - Position reported by the same control that draws the orb.
 * @param now - Current epoch time.
 * @returns Whether the fix is fresh, accurate, and inside the app's Hong Kong bounds.
 */
export function canCenterOnLocation(position: Position, now = Date.now()): boolean {
  const { latitude, longitude, accuracy } = position.coords
  const age = now - position.timestamp
  return (
    Number.isFinite(age) &&
    age >= 0 &&
    age <= 15_000 &&
    Number.isFinite(accuracy) &&
    accuracy >= 0 &&
    accuracy <= 100 &&
    latitude >= 22.1193278 &&
    latitude <= 22.4393278 &&
    longitude >= 114.0028131 &&
    longitude <= 114.3228131
  )
}

/**
 * Uses MapLibre's single location watch for both the visible orb and app location state.
 * @param control - Mounted geolocation control.
 * @param map - Map owning the control.
 * @param options - State publication and guarded initial camera behavior.
 * @returns Cleanup restoring the control and removing app-owned listeners.
 * @remarks Automatic tracking observes without locking the camera. Explicit button
 * activation restores normal MapLibre behavior, including locating outside Hong Kong.
 */
export function installLocationTracking(
  control: GeolocateControl,
  map: MapLibreMap,
  options: {
    onPosition: (position: Position | null) => void
    canAutoCenter: () => boolean
    onInitialFix: (position: Position) => void
  },
): () => void {
  // Isolate the existing private-control workaround; never toggle tracking with a timed click.
  const adapter = control as ControlAdapter
  const updateCamera = adapter._updateCamera
  let automatic = true
  let initialCenterPending = options.canAutoCenter()

  /** Preserves the user's camera after they start interacting with the map. */
  const onMove = (event: { originalEvent?: unknown }): void => {
    if (event.originalEvent) initialCenterPending = false
  }

  /** Gives explicit location-button activation normal MapLibre camera authority. */
  const onActivate = (): void => {
    automatic = false
    initialCenterPending = false
  }

  /** Publishes the orb's fix and optionally centers once without enabling camera lock. */
  const onPosition = (position: GeolocatePositionEvent): void => {
    options.onPosition({ coords: position.coords, timestamp: position.timestamp })
    if (!automatic) return
    // Use MapLibre's own transition to background tracking, retaining the dot and watch.
    adapter._onMoveStart({})
    if (
      initialCenterPending &&
      options.canAutoCenter() &&
      canCenterOnLocation(position)
    ) {
      initialCenterPending = false
      options.onInitialFix(position)
    }
  }

  /** Clears app location state when the underlying control cannot obtain a fix. */
  const onError = (): void => options.onPosition(null)

  adapter._updateCamera = position => {
    if (!automatic) updateCamera.call(control, position)
  }
  adapter._geolocateButton.addEventListener('click', onActivate, { capture: true })
  control.on('geolocate', onPosition)
  control.on('error', onError)
  map.on('movestart', onMove)
  // Geolocation support checks may finish after the map loads; start only when ready.
  const readiness = new MutationObserver(() => {
    if (!adapter._geolocateButton.disabled) {
      readiness.disconnect()
      control.trigger()
    }
  })
  if (adapter._geolocateButton.disabled) {
    readiness.observe(adapter._geolocateButton, {
      attributes: true,
      attributeFilter: ['disabled'],
    })
  } else control.trigger()

  return () => {
    readiness.disconnect()
    adapter._updateCamera = updateCamera
    adapter._geolocateButton.removeEventListener('click', onActivate, { capture: true })
    control.off('geolocate', onPosition)
    control.off('error', onError)
    map.off('movestart', onMove)
  }
}
