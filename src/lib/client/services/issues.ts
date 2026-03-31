// SERVICES
import { toIssueMessage } from '$lib/client/services/form'

/**
 * Collects unique issue messages whose path starts with the provided path segments.
 *
 * @param issues Raw issue list to inspect.
 * @param expectedPath Path prefix to match, such as `['data', 'organisationId']`.
 * @returns Unique issue messages for matching issues.
 */
export function getIssueMessagesForPath(
  issues: unknown[],
  expectedPath: Array<string | number>,
): string[] {
  const messages = issues
    .filter(issue => {
      if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
      const path = (issue as { path?: unknown }).path
      return (
        Array.isArray(path) &&
        expectedPath.every((segment, index) => path[index] === segment)
      )
    })
    .map(toIssueMessage)
    .filter((message): message is string => Boolean(message))

  return Array.from(new Set(messages))
}
