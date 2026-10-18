// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. NAVIGATION INTENT
// - NavigationRouting.open
// - NavigationRouting.selectMode
// - NavigationRouting.retry
// - NavigationRouting.cancel
// - NavigationRouting.close
// - NavigationRouting.showMap
// - NavigationRouting.showDirections
// - NavigationRouting.highlightSegment
// - NavigationRouting.calculate
// - NavigationRouting.message
// ---

// VALIDATION
import { routingPointSchema } from '#lib/routing/routing.types.js'
// TYPES
import type {
  Journey,
  RoutingDestination,
  RoutingMode,
  RoutingPoint,
  RoutingRequest,
} from '#lib/routing/routing.types.js'

type NavigationState =
  | { phase: 'idle' | 'locating' | 'loading' }
  | { phase: 'ready'; journey: Journey }
  | { phase: 'error'; message: string }

type Capabilities = {
  locate: () => Promise<RoutingPoint>
  warmup: () => Promise<unknown>
  route: (request: RoutingRequest) => Promise<Journey>
  openPanel: () => void
  closePanel: () => void
}

/** One public layout's transient navigation intent; never persisted to storage or URLs. */
export class NavigationRouting {
  showingMap = $state(false)
  destination = $state<RoutingDestination | null>(null)
  mode = $state<RoutingMode>('pedestrian')
  state = $state<NavigationState>({ phase: 'idle' })
  private hoveredSegment = $state<number | null>(null)
  private focusedSegment = $state<number | null>(null)
  highlightedSegment = $derived(this.hoveredSegment ?? this.focusedSegment)
  private origin: RoutingPoint | null = null
  private revision = 0

  /**
   * Creates navigation orchestration with explicit browser, API and panel capabilities.
   * @param capabilities - Layout-owned effects, injectable for race-condition tests.
   */
  constructor(private readonly capabilities: Capabilities) {}

  /**
   * Opens directions, starts warm-up and requests browser location in parallel.
   * @param destination - Marker coordinates and display title.
   * @returns Completion after the current journey request, unless superseded.
   */
  async open(destination: RoutingDestination): Promise<void> {
    const revision = ++this.revision
    this.highlightSegment(null)
    this.showingMap = false
    this.destination = destination
    this.origin = null
    this.state = { phase: 'locating' }
    this.capabilities.openPanel()
    // A failed warm-up is recoverable: the route request independently starts the engine.
    void this.capabilities.warmup().catch(() => {})
    try {
      const point = await this.capabilities.locate()
      if (revision !== this.revision) return
      const parsed = routingPointSchema.safeParse(point)
      if (!parsed.success)
        throw new Error(
          'Directions currently cover Hong Kong only. Your location is outside the supported area.',
        )
      const target = routingPointSchema.safeParse(destination)
      if (!target.success)
        throw new Error('This marker is outside the supported Hong Kong routing area.')
      this.origin = parsed.data
      await this.calculate()
    } catch (cause) {
      if (revision === this.revision)
        this.state = { phase: 'error', message: this.message(cause) }
    }
  }

  /**
   * Switches profiles while retaining this navigation intent's origin.
   * @param mode - Supported street mode selected by the user.
   * @returns Completion of recalculation, or nothing while location is pending.
   */
  async selectMode(mode: RoutingMode): Promise<void> {
    if (this.mode === mode) return
    this.mode = mode
    if (this.origin && this.destination) await this.calculate()
  }

  /** Retries routing or asks for location again after a location failure. @returns Completion of the retry. */
  async retry(): Promise<void> {
    if (!this.destination) return
    if (this.origin) await this.calculate()
    else await this.open(this.destination)
  }

  /** Discards transient coordinates and invalidates pending results. @returns Nothing. */
  cancel(): void {
    ++this.revision
    this.highlightSegment(null)
    this.showingMap = false
    this.origin = null
    this.destination = null
    this.state = { phase: 'idle' }
  }

  /** Closes the panel and discards this navigation intent. @returns Nothing. */
  close(): void {
    this.cancel()
    this.capabilities.closePanel()
  }

  /** Minimizes directions while retaining the calculated route on the map. @returns Nothing. */
  showMap(): void {
    if (this.state.phase !== 'ready') return
    this.highlightSegment(null)
    this.showingMap = true
    this.capabilities.closePanel()
  }

  /** Restores directions for the existing journey without recalculation. @returns Nothing. */
  showDirections(): void {
    this.showingMap = false
    this.capabilities.openPanel()
  }

  /**
   * Highlights a valid step locally, preferring pointer hover over retained keyboard focus.
   * @param index - Step index, or null to clear this input's highlight.
   * @param input - Pointer or keyboard focus; omitted to clear both on lifecycle changes.
   * @returns Nothing.
   */
  highlightSegment(index: number | null, input?: 'pointer' | 'focus'): void {
    const valid =
      index !== null &&
      this.state.phase === 'ready' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < this.state.journey.segments.length
        ? index
        : null
    if (!input || input === 'pointer') this.hoveredSegment = valid
    if (!input || input === 'focus') this.focusedSegment = valid
  }

  /** Calculates only the newest destination/profile request. @returns Completion after its result is handled. */
  private async calculate(): Promise<void> {
    if (!this.origin || !this.destination) return
    const revision = ++this.revision
    const request = {
      origin: this.origin,
      destination: this.destination,
      mode: this.mode,
    }
    this.highlightSegment(null)
    this.state = { phase: 'loading' }
    try {
      const journey = await this.capabilities.route(request)
      if (revision === this.revision) this.state = { phase: 'ready', journey }
    } catch (cause) {
      if (revision === this.revision)
        this.state = { phase: 'error', message: this.message(cause) }
    }
  }

  /**
   * Reads safe API errors without assuming Error instances across remote serialization.
   * @param cause - Browser or remote failure.
   * @returns A useful message for retryable panel feedback.
   */
  private message(cause: unknown): string {
    if (cause instanceof Error) return cause.message
    if (cause && typeof cause === 'object' && 'body' in cause) {
      const body = cause.body
      if (
        body &&
        typeof body === 'object' &&
        'message' in body &&
        typeof body.message === 'string'
      )
        return body.message
    }
    return 'Directions could not be loaded. Please try again.'
  }
}
