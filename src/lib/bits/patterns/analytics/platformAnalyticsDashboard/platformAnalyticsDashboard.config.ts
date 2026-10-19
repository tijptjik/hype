// TYPES
import type { PlatformAnalyticsFacet } from '#lib/api/services/platformAnalytics.types.js'

/** Shared headings and loading geometry for each platform analytics facet. */
export const PLATFORM_ANALYTICS_PRESENTATION = {
  views: {
    timeline: 'Page views',
    overview: 'Traffic overview',
    rankings: 'Leaders',
    sections: ['Paths', 'Referrers', 'Hosts'],
    metricCount: 2,
  },
  audience: {
    timeline: 'Audience activity',
    overview: 'Traffic overview',
    rankings: 'Audience breakdown',
    sections: ['Countries', 'Browsers', 'Devices', 'Operating systems'],
    metricCount: 2,
  },
  data: {
    timeline: 'Database activity',
    overview: 'Queries & latency',
    rankings: 'Regions & queues',
    sections: ['Rows read by region', 'Queue writes', 'Queue reads', 'Queue deletions'],
    metricCount: 9,
  },
} as const satisfies Record<
  PlatformAnalyticsFacet,
  {
    timeline: string
    overview: string
    rankings: string
    sections: readonly string[]
    metricCount: number
  }
>
