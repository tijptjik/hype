// TYPES
import type { setupRequestHandler } from '#lib/api/index.js'
import type { RequestEvent } from '@sveltejs/kit'
import type { StandardSchemaV1 } from '@standard-schema/spec'

export type GuardedBaseContext = Awaited<ReturnType<typeof setupRequestHandler>> & {
  event: RequestEvent
}

export type GuardedQueryContext = GuardedBaseContext

type GuardedInvalid = (...issues: StandardSchemaV1.Issue[]) => never

type GuardedIssueResolver = (message: string) => StandardSchemaV1.Issue

export type GuardedIssue = GuardedIssueResolver & {
  data: Record<string, GuardedIssueResolver>
}

export type GuardedFormContext = GuardedBaseContext & {
  invalid: GuardedInvalid
  issue: GuardedIssue
}

export type GuardedCommandContext = GuardedBaseContext
