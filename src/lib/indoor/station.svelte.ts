import { prepareIndoorData } from './preload'
import { indexMatches } from './indexNavigation'
import { visibleIndoorPlaces } from './visibility'
import { exposedIndoorPlaces } from './exposure'
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
  /** Fits the visible floors without changing their orientation or removing the route.
   * @returns Nothing.
   * @remarks Selection and route playback framing must release the camera before fitting.
   */
  fitView(): void {
    this.stopFly()
    this.selected = null
    this.routeProgress = 0
    this.arrival = 0
    this.fitRevision++
  }
  /** Clears the route, optionally retaining the current camera. @param preserveCamera Keep orientation and framing for a floor change. @returns Nothing. */
  clearRoute(preserveCamera = false): void {
    if (this.route) this.exploded = true
    if (!preserveCamera) this.planTilt = 0
    this.route = null
    this.routeMode = 'highlight'
    this.arrival = 0
    this.routeProgress = 0
    if (!preserveCamera) {
      this.bearing = this.data?.coordinateSpace === 'image-pixels' ? 0 : -115
      this.tilt = 60
      this.spacing = 25
      this.fitRevision++
    }
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
  worldView = $state.raw<{
    center: [number, number]
    zoom: number
    bearing: number
    pitch: number
    metresPerPixel: number
  } | null>(null)
  returningToMap = $state(false)
  returnSceneReady = $state(false)
  returnMapReady = $state(false)
  returnFading = $state(false)
  active = $state(false)
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
  screenAlignedLogos = $state(true)
  data = $state.raw<IndoorData | null>(null)
  private featuredUnits: () => ReadonlySet<string> | null = () => null
  private sourceEntries = $state.raw<Place[]>([])
  entries = $derived(
    visibleIndoorPlaces(this.sourceEntries, this.isMtr ? this.featuredUnits() : null),
  )
  /** Configure shop visibility without altering physical geometry.
   * @param featuredUnits Null exposes all shops; a set restricts shops to accepted Feature units.
   * @param navigateSelection Whether selection updates public URLs; false keeps embedded maps local.
   */
  constructor(
    featuredUnits: () => ReadonlySet<string> | null = () => null,
    private navigateSelection = true,
  ) {
    this.featuredUnits = featuredUnits
  }
  floor = $state('')
  selected = $state<Place | null>(null)
  error = $state('')
  loading = $state(false)
  fitRevision = $state(0)
  documents = $state.raw<{ kind: string; path: string }[]>([])
  private controller: AbortController | null = null
  private loadedCode = ''
  enterFromMap = false
  entryPose = { bearing: 0, tilt: 0 }
  /** Mounted scene callback freezes the visible frame before changing floors. */
  preserveFloorCamera: ((id: string) => void) | null = null
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
    const previousView = {
      active: this.active,
      code: this.loadedCode,
      floor: this.floor,
      selected: this.selected?.id,
      exploded: this.exploded,
    }
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
    this.returningToMap = false
    this.returnFading = false
    if ((id && this.route) || code !== this.loadedCode) this.clearRoute()
    if (this.code !== code) this.worldView = null
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
        this.sourceEntries = data ? exposedIndoorPlaces(data, places(data)) : []
        this.floor = data ? value(initialLevel(data).properties, 'level_id') : ''
        this.bearing = this.enterFromMap
          ? this.entryPose.bearing
          : data?.coordinateSpace === 'image-pixels'
            ? 0
            : -115
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
    this.selected = id
      ? (this.entries.find(p => p.id === id || p.sourceIds?.includes(id)) ?? null)
      : null
    if (id && !this.selected)
      this.error = 'This place is not available in the venue snapshot.'
    if (this.selected) {
      this.floor = this.selected.levelId
      this.exploded = false
    }
    if (this.enterFromMap) {
      this.bearing = this.entryPose.bearing
      this.planTilt = this.entryPose.tilt
      this.exploded = false
      this.enterFromMap = false
    }
    if (
      !previousView.active ||
      previousView.code !== this.loadedCode ||
      previousView.floor !== this.floor ||
      previousView.selected !== this.selected?.id ||
      previousView.exploded !== this.exploded
    )
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
  /** Camera-owned distance ordering; updated by the mounted scene. */
  rankIndexPlaces: ((places: Place[]) => Place[]) | null = null
  private indexCycle: {
    venue: string
    key: string
    ids: string[]
    current: string
  } | null = null
  /** Open the nearest match, then cycle a stable nearest-first list on repeated clicks.
   * @param key Map legend category or area key. @returns Nothing.
   * @remarks Distances use the current projected camera centre, not device geolocation. Flat views prefer the current floor.
   */
  selectIndex(key: string): void {
    const matches = indexMatches(this.entries, key)
    if (!matches.length) return
    const previous = this.indexCycle
    const continuing =
      previous?.venue === this.code &&
      previous.key === key &&
      previous.current === this.selected?.id
    const ordered = continuing
      ? previous.ids
          .map(id => matches.find(place => place.id === id))
          .filter((place): place is Place => Boolean(place))
      : (this.rankIndexPlaces?.(matches) ?? matches)
    if (!ordered.length) return
    const index = continuing
      ? (ordered.findIndex(place => place.id === previous.current) + 1) % ordered.length
      : 0
    const place = ordered[index]
    this.indexCycle = {
      venue: this.code,
      key,
      ids: ordered.map(place => place.id),
      current: place.id,
    }
    if (this.route) this.clearRoute()
    this.floor = place.levelId
    this.exploded = false
    this.planTilt = 0
    this.selected = place
    this.fitRevision++
    this.select(place)
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
    const preserveCamera = !this.exploded
    if (preserveCamera) this.preserveFloorCamera?.(id)
    this.clearRoute(preserveCamera)
    this.floor = id
    this.exploded = false
    this.selected = null
    if (!preserveCamera) this.fitRevision++
    if (this.navigateSelection)
      void goto(premisesPath(this.code), { replace: true, reset: false })
  }
  /** Opens a source space. @param place Selected record. @returns Nothing. */
  select(place: Place): void {
    if (this.navigateSelection) {
      void goto(premisesPath(this.code, place.id), { reset: false })
    } else {
      this.floor = place.levelId
      this.exploded = false
      this.selected = place
      this.fitRevision++
    }
  }
  /** Restores the outdoor map. @param navigation Whether to navigate. @returns Nothing. */
  close(navigation = true): void {
    if (navigation) {
      if (this.returningToMap) return
      if (this.worldView && this.data) {
        this.returnSceneReady = false
        this.returnMapReady = false
        this.returnFading = false
        this.returningToMap = true
        return
      }
      void goto('/')
      return
    }
    this.returningToMap = false
    this.returnFading = false
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
