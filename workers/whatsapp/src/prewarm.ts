/** Best-effort startup only: never opens a media socket or starts call signalling. */
export class RelayPrewarmer {
  private pending?: Promise<void>
  private lastStarted = -Infinity
  private offers = new Set<string>()

  constructor(
    private readonly warm: () => Promise<void>,
    private readonly retain: (task: Promise<void>) => void,
  ) {}

  request(): void {
    const now = Date.now()
    if (this.pending || now - this.lastStarted < 30_000) return
    this.lastStarted = now
    this.pending = Promise.resolve()
      .then(this.warm)
      .catch(() => {
        /* Actual call setup retries normally if speculative startup fails. */
      })
      .finally(() => {
        this.pending = undefined
      })
    this.retain(this.pending)
  }

  incoming(offers: { id: string }[]): void {
    const next = new Set(offers.map(offer => offer.id))
    const fresh = [...next].some(id => !this.offers.has(id))
    this.offers = next
    if (fresh) this.request()
  }
}
