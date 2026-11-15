import { visibleIndoorPlaces } from './visibility'
import type { IndoorRoute } from './routing'
import { goto } from '$app/navigation'
import {
  initialLevel,
  loadIndoorData,
  places,
  value,
  type IndoorData,
  type Place,
} from './model'
import { findStation, indoorSnapshots, premisesPath } from './registry'
/** Public indoor session; source spaces remain independent of catalogue identities. */
export class StationState {
  route = $state.raw<IndoorRoute | null>(null)
  routeMode = $state<'highlight' | 'flying' | 'arrived'>('highlight')
  routeProgress = $state(0)
  arrival = $state(0)
  /** Stops camera playback while preserving the route. @returns Nothing. */
  stopFly(): void {
    this.routeMode = 'highlight'
  }
  /** Clears the route and restores the default camera. @returns Nothing. */
  clearRoute(): void {
    if (this.route) this.exploded = true
    this.planTilt = 0
    this.route = null
    this.routeMode = 'highlight'
    this.arrival = 0
    this.routeProgress = 0
    this.bearing = -115
    this.tilt = 60
    this.spacing = 25
    this.fitRevision++
  }
  /** Starts an interruptible route animation. @returns Nothing. */
  flyRoute(): void {
    if (!this.route) return
    this.exploded = true
    this.selected = null
    this.routeProgress = 0
    this.arrival = 0
    this.spacing = 25
    this.routeMode = 'flying'
    this.fitRevision++
  }
  active = $state(false)
  code = $state('KET')
  isMtr = $derived(Boolean(findStation(this.code)))
  metadata = $derived(findStation(this.code))
  exploded = $state(true)
  bearing = $state(-115)
  tilt = $state(60)
  planTilt = $state(0)
  spacing = $state(25)
  showInferred = $state(true)
  data = $state.raw<IndoorData | null>(null)
  private sourceEntries = $state.raw<Place[]>([])
  entries = $derived(
    visibleIndoorPlaces(this.sourceEntries, this.isMtr ? this.featuredUnits() : null),
  )
  /** Configure shop visibility without altering physical geometry.
   * @param featuredUnits Null exposes all shops; a set restricts shops to accepted Feature units.
   */
  constructor(private featuredUnits: () => ReadonlySet<string> | null = () => null) {}
  floor = $state('')
  selected = $state<Place | null>(null)
  error = $state('')
  loading = $state(false)
  fitRevision = $state(0)
  documents = $state.raw<{ kind: string; path: string }[]>([])
  private controller: AbortController | null = null
  private loadedCode = ''
  /** Opens a station URL or hydrates navigation. @param code Official code. @param id Source space ID. @param navigation Whether to navigate. @returns Load completion. */
  async open(code = 'KET', id?: string, navigation = true): Promise<void> {
    if (navigation) {
      await goto(premisesPath(code, id))
      return
    }
    if ((id && this.route) || code !== this.loadedCode) this.clearRoute()
    this.active = true
    this.code = code
    this.error = ''
    if (this.loadedCode !== code) {
      this.loadedCode = ''
      this.controller?.abort()
      const controller = new AbortController()
      this.controller = controller
      this.data = null
      this.sourceEntries = []
      this.documents = []
      this.selected = null
      this.loading = true
      try {
        const response = await fetch('/indoor/mtr/manifest.json', {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Could not load station maps')
        const manifest = await response.json()
        const documents = manifest.entries.filter(
          (e: { station: string; status: string }) =>
            e.station === code && e.status === 'downloaded',
        )
        const data = indoorSnapshots[code]
          ? await loadIndoorData(indoorSnapshots[code], controller.signal)
          : null
        if (controller.signal.aborted) return
        this.documents = documents
        this.data = data
        this.sourceEntries = data ? places(data) : []
        this.floor = data ? value(initialLevel(data).properties, 'level_id') : ''
        this.exploded = true
        this.loadedCode = code
      } catch (error) {
        if (!controller.signal.aborted)
          this.error = error instanceof Error ? error.message : 'Could not load station'
      } finally {
        if (this.controller === controller) this.loading = false
      }
      if (controller.signal.aborted) return
    }
    this.selected = id ? (this.entries.find(p => p.id === id) ?? null) : null
    if (id && !this.selected)
      this.error = 'This place is not available in the station snapshot.'
    if (this.selected) {
      this.floor = this.selected.levelId
      this.exploded = false
    }
    this.fitRevision++
  }
  /** Opens a detailed plan. @param id Source level ID. @returns Nothing. */
  openFloor(id: string): void {
    this.clearRoute()
    this.floor = id
    this.exploded = false
    this.selected = null
    this.fitRevision++
    void goto(premisesPath(this.code), { replace: true, reset: false })
  }
  /** Opens a source space. @param place Selected record. @returns Nothing. */
  select(place: Place): void {
    void goto(premisesPath(this.code, place.id), { reset: false })
  }
  /** Restores the outdoor map. @param navigation Whether to navigate. @returns Nothing. */
  close(navigation = true): void {
    if (navigation) {
      void goto('/')
      return
    }
    this.controller?.abort()
    this.loading = false
    this.clearRoute()
    this.active = false
    this.selected = null
  }
  /** Cancels pending loading. @returns Nothing. */
  dispose(): void {
    this.controller?.abort()
  }
}
