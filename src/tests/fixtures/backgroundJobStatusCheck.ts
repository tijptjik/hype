import { mount } from 'svelte'
import Status from '#lib/bits/patterns/layout/app/BackgroundJobStatus.svelte'
import { BackgroundJobs } from '#lib/context/backgroundJobs.svelte.js'

/** Mounts sample progress without resource mutations. @returns Jobs for interaction checks. */
export function showProgress(): BackgroundJobs {
  const jobs = new BackgroundJobs()
  jobs.jobs = [
    {
      id: 1,
      label: 'Archive features',
      completed: 8,
      total: 16,
      errors: 0,
      status: 'running',
    },
  ]
  const target = document.createElement('div')
  target.id = 'progress-style-check'
  document.body.append(target)
  mount(Status, { target, props: { jobs } })
  return jobs
}
