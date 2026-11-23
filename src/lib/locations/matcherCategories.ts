export const MATCHER_CATEGORIES = [
  { id: 'all', label: 'All MTR shops' },
  { id: 'matched', label: 'Matched' },
  { id: 'exact', label: 'Code + name' },
  { id: 'code', label: 'Code · review' },
  { id: 'name', label: 'Name only' },
  { id: 'none', label: 'No candidates' },
] as const
export type MatcherCategory = (typeof MATCHER_CATEGORIES)[number]['id']
export type MatcherCounts = Record<MatcherCategory, number>
