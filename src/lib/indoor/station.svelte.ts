import { prepareIndoorData } from './preload'
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
import {
  findStation,
  findPremises,
  indoorSnapshots,
  premisesPath,
  loadPremisesCatalogue,
} from './registry'
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
    this.bearing = this.data?.coordinateSpace === 'image-pixels' ? 0 : -115
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
  code = $state('')
  isMtr = $derived(Boolean(findStation(this.code)))
  metadata = $state<ReturnType<typeof findPremises>>(undefined)
  isBuilding = $derived(!this.isMtr)
  exploded = $state(true)
  bearing = $state(-115)
  tilt = $state(60)
  planTilt = $state(0)
  spacing = $state(25)
  showInferred = $state(true)
  artworkOpacity = $state(0)
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
  enterFromMap = false
  private prepared: { code: string; data: IndoorData | null } | null = null
  /** Prepare an indoor map while the outdoor camera approaches.
   * @param code Venue code. @returns Completion once the destination is ready.
   */
  async prepareFromMap(code: string): Promise<void> {
    if (!indoorSnapshots[code]) await loadPremisesCatalogue()
    const data = indoorSnapshots[code]
      ? await prepareIndoorData(indoorSnapshots[code])
      : null
    this.prepared = { code, data }
  }
  /** Opens a station URL or hydrates navigation. @param code Official code. @param id Source space ID. @param navigation Whether to navigate. @returns Load completion. */
  async open(code = this.code, id?: string, navigation = true): Promise<void> {
    if (!code) {
      const catalogue = await loadPremisesCatalogue()
      code = catalogue[0]?.code ?? ''
      if (!code) {
        this.error = 'No published premises maps are available'
        return
      }
    }
    if (navigation) {
      await goto(premisesPath(code, id))
      return
    }
    if ((id && this.route) || code !== this.loadedCode) this.clearRoute()
    this.active = true
    this.code = code
    this.metadata = findPremises(code)
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
        if (!indoorSnapshots[code]) await loadPremisesCatalogue(controller.signal)
        this.metadata = findPremises(code)
        const data =
          this.prepared?.code === code
            ? this.prepared.data
            : indoorSnapshots[code]
              ? await loadIndoorData(indoorSnapshots[code], controller.signal)
              : null
        this.prepared = null
        const documents =
          data?.documents ??
          (this.isMtr
            ? ['layout', 'shops', 'location'].map(kind => ({
                kind,
                path: `https://www.mtr.com.hk/archive/en/services/${kind === 'layout' ? 'layouts' : kind === 'shops' ? 'shop' : 'maps'}/${code.toLowerCase()}.pdf`,
              }))
            : [])
        if (controller.signal.aborted) return
        this.documents = documents
        this.data = data
        this.sourceEntries = data ? places(data) : []
        this.floor = data ? value(initialLevel(data).properties, 'level_id') : ''
        this.bearing =
          this.enterFromMap || data?.coordinateSpace === 'image-pixels' ? 0 : -115
        this.exploded = !this.enterFromMap && !this.isBuilding
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
      this.error = 'This place is not available in the venue snapshot.'
    if (this.selected) {
      this.floor = this.selected.levelId
      this.exploded = false
    }
    if (this.enterFromMap) {
      this.bearing = 0
      this.planTilt = 0
      this.exploded = false
      this.enterFromMap = false
    }
    this.fitRevision++
  }
  /** Detect new releases without disturbing an unchanged map or active route animation. @returns Completion. */
  async checkPublished(): Promise<void> {
    if (
      !this.active ||
      this.loading ||
      this.routeMode === 'flying' ||
      !this.data?.basePath
    )
      return
    try {
      const response = await fetch(this.data.basePath, { cache: 'no-store' })
      if (!response.ok) return
      const pointer: { hash: string } = await response.json()
      if (pointer.hash !== this.data.releaseHash) await this.refreshPublished()
    } catch {
      /* A transient refresh failure leaves the complete current release usable. */
    }
  }
  /** Refresh published geometry and occupancy together on explicit reload or tab return. @returns Completion. */
  async refreshPublished(): Promise<void> {
    if (!this.active || this.loading || this.routeMode === 'flying') return
    const id = this.selected?.id
    this.loadedCode = ''
    this.clearRoute()
    await this.open(this.code, id, false)
  }
  /** Select a shared picker option without opening the station panel.
   * @param id Floor identity or the all-level option. @returns Nothing.
   */
  selectLevel(id: string): void {
    if (id !== 'all') {
      this.openFloor(id)
      return
    }
    this.openFloor(this.floor)
    this.exploded = true
    this.selected = null
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
