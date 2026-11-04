/** A single submission's acknowledged steps, isolated from later requests and account scopes. */
export class TaskSubmissionAttempt {
  private readonly steps = new Map<string, Promise<unknown>>()
  private readonly completed = new Set<string>()
  private readonly deadlines = new Map<string, number>()

  /** Whether active work must settle or unfinished credentials still permit retry. */
  get reusable(): boolean {
    // Let active operations settle before expiry can replace their owning attempt.
    if ([...this.steps.keys()].some(key => !this.completed.has(key))) return true
    return [...this.deadlines].every(
      ([key, deadline]) => this.completed.has(key) || deadline > Date.now(),
    )
  }

  /**
   * Bounds retention of an unfinished step by its server-issued credential lifetime.
   * @param key Step whose successful result no longer needs the credential.
   * @param expiresAt ISO expiry from the upload authorization response.
   * @returns Nothing; malformed/missing deadlines are not retained.
   */
  expires(key: string, expiresAt: string | undefined): void {
    const deadline = Date.parse(expiresAt ?? '')
    if (Number.isFinite(deadline)) this.deadlines.set(key, deadline)
  }

  /**
   * Creates request-local retention controlled by its owning form.
   * @param isCurrent Whether this request still belongs to the current form/account scope.
   */
  constructor(private readonly isCurrent: () => boolean) {}

  /**
   * Runs or resumes one idempotent step without repeating acknowledged work.
   * @param key Stable step identity within this submission.
   * @param operation Operation to execute when no successful or pending result exists.
   * @returns The retained result; failed steps may be retried.
   * @remarks Scope changes reject late results and prevent starting later steps.
   */
  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!this.isCurrent()) throw new Error('Submission scope changed')
    let pending = this.steps.get(key) as Promise<T> | undefined
    if (!pending) {
      pending = Promise.resolve().then(() => {
        if (!this.isCurrent()) throw new Error('Submission scope changed')
        return operation()
      })
      this.steps.set(key, pending)
    }
    try {
      const result = await pending
      if (!this.isCurrent()) throw new Error('Submission scope changed')
      this.completed.add(key)
      return result
    } catch (error) {
      if (this.steps.get(key) === pending) this.steps.delete(key)
      throw error
    }
  }
}

/** Form-owned retry retention; never shared globally or across account scopes. */
export class TaskSubmissionRetry {
  private current:
    | {
        scope: string
        fingerprint: string
        files: File[]
        attempt: TaskSubmissionAttempt
      }
    | undefined

  /**
   * Retains one matching request and replaces changed content, files or authorization scope.
   * @param scope Live authorization scope getter from the owning surface.
   * @param fingerprint Serialized contribution type, target and submitted fields.
   * @param files Ordered selected files; replacement/cropping creates a different request.
   * @returns The compatible attempt or a new isolated attempt.
   */
  begin(
    scope: () => string,
    fingerprint: string,
    files: File[],
  ): TaskSubmissionAttempt {
    const identity = scope()
    const retained = this.current
    if (
      retained?.scope === identity &&
      retained.attempt.reusable &&
      retained.fingerprint === fingerprint &&
      retained.files.length === files.length &&
      retained.files.every((file, index) => file === files[index])
    )
      return retained.attempt
    const attempt: TaskSubmissionAttempt = new TaskSubmissionAttempt(
      (): boolean => this.current?.attempt === attempt && scope() === identity,
    )
    this.current = { scope: identity, fingerprint, files: [...files], attempt }
    return attempt
  }

  /** Clears retained credentials/results after success or form disposal. @returns Nothing. */
  clear(): void {
    this.current = undefined
  }
}
