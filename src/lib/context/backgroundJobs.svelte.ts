/** Progress retained by the root layout across in-app navigation. */
export type BackgroundJob = {
  id: number
  label: string
  total: number
  successMessage?: string
  completed: number
  errors: number
  status: 'running' | 'complete' | 'stopped' | 'failed'
}

/** Per-application job ownership; never shared between SSR requests or accounts. */
export class BackgroundJobs {
  jobs: BackgroundJob[] = $state([])
  private sequence = 0

  /** Whether leaving the document would interrupt a mutation. @returns Active-job presence. */
  get busy(): boolean {
    return this.jobs.some(job => job.status === 'running')
  }

  /**
   * Runs captured work independently of its originating component.
   * @param label User-facing operation description.
   * @param total Number of captured records.
   * @param work Operation reporting completed chunks; false indicates an account-bound stop.
   * @param successMessage Optional final toast text replacing progress.
   * @returns Completion after the job status is settled.
   */
  async run(
    label: string,
    total: number,
    work: (advance: (count: number, errors: number) => void) => Promise<boolean>,
    successMessage?: string,
  ): Promise<void> {
    const id = ++this.sequence
    this.jobs.push({
      id,
      label,
      total,
      successMessage,
      completed: 0,
      errors: 0,
      status: 'running',
    })
    const job = this.jobs.find(value => value.id === id)!
    try {
      const completed = await work((count, errors) => {
        job.completed += count
        job.errors += errors
      })
      job.status = completed ? 'complete' : 'stopped'
    } catch (error) {
      job.status = 'failed'
      throw error
    }
  }

  /** Removes a settled progress entry. @param id Job identity. @returns Nothing. */
  dismiss(id: number): void {
    this.jobs = this.jobs.filter(job => job.id !== id || job.status === 'running')
  }
}
