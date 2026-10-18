# Breadline schedule and event schema proposal

Tracking: [events parent #181](https://github.com/tijptjik/hype/issues/181),
[event model #195](https://github.com/tijptjik/hype/issues/195),
[schedules #196](https://github.com/tijptjik/hype/issues/196), and
[claims #197](https://github.com/tijptjik/hype/issues/197).

This is an unapplied schema proposal for review, based on the
[Breadline v4 specification](../breadline.v4.spec.md). The draft is retained in `drafts/breadline.schema.ts.txt` and
`drafts/breadline.operations.sql`; neither is active in Drizzle or the migration
queue. The current implementation is limited to the [user import](02-user-import.md).

| Requirement | Proposed storage |
| --- | --- |
| Weekly, nth-weekday and holiday schedules | `schedule`, `scheduleRule` |
| Dated exceptions and translated labels | `scheduleException`, rule/exception I18n tables |
| Multiple windows and overnight closing | Rule/exception time-segment tables with explicit end-day offset |
| Pickup and drop-off occurrences | `event`, nullable capacity for unlimited attendance |
| Claims, confirmation and itinerary ordering | `eventAttendance`, nullable `hasAttended`, per-user rank |
| Numeric expected/collected quantities | `eventProperty.value` as REAL |
| Protected/calculated property definitions | `property.isSystemProperty`, `property.isCalculated` |
| Event-only property presentation | `layerProperty.isEventExclusive` |
| Contact details | `user.telephone` is isolated in the user migration; existing `username` is retained |
| Daily callers and WhatsApp contact | `projectDailyRole`, unique WhatsApp contact per project/date |
| Daily follow-up | `projectDailyParticipation` |
| Estimated route distance/time | `eventTravelLeg`, metres/seconds and travel method |
| Period metrics and user rankings | `leaderboard`, `leaderboardRanking` |
| Import identities and progress | Offline, per-target migration records; no Hype tables |

## Proposed interpretation

- Schedule owners retain the spec's feature/place polymorphism. Place IDs are
  external to Hype; owner existence must be checked in services. `purpose`
  distinguishes opening hours from pickup/drop-off hours.
- Store dates and wall-clock times separately in `Asia/Hong_Kong`. A segment with
  `untilDayOffset = 1` ends on the next day. Validate calendar dates and HH:mm
  values in the future writer; SQL checks are not a full calendar validator.
- Dated exceptions replace the day's rules; otherwise higher-priority matching
  rules win. Holiday priority and equal-priority conflicts must be resolved by
  the occurrence generator, not inferred from insertion order.
- `eventAttendance.hasAttended` preserves all three states: NULL unknown, 1 seen,
  0 abandoned. A claim exists while its attendance row exists. Claim release,
  capacity checking and cached `atCapacity` updates require one atomic service
  operation; the schema alone does not enforce capacity under concurrent writes.
- Pickup writers must set capacity 1. Drop-off writers leave it NULL. The generic
  event model also reserves programme and programmeSlot types.
- Event window fields preserve occurrence-specific overrides independently of the
  schedule. Occurrence generation/deduplication and cancellation audit semantics
  still require design under #195/#196 before any scheduler writes events.
- Drop-off totals are calculated from confirmed deliveries. System/calculated and
  event-only flags are metadata at this stage: remote APIs and forms must enforce
  their behavior before the properties are enabled. No numeric UI component is
  introduced by this schema-only change.
- Foreign keys restrict destructive deletion of referenced historical entities.
  Archive features/users instead; a future explicit purge must delete dependants
  in order. Daily assignments do not themselves grant permanent project roles.
- Existing preference JSON can hold transport preferences after its validator and
  UI contract are agreed. Route values are estimates and need invalidation when
  endpoints, user order or routing provider/version changes.
- NULL leaderboard timeframe means all-time; NULL period means an open period.
  Period finalisation and deduplication remain aggregation-service responsibilities.
  Badge criteria remain explicitly undecided in the source spec; badge persistence
  is deferred until the existing-achievement investigation in #216 is complete.

## Migration generation and verification

The broader schema is deferred. Its previous synthetic checks are not acceptance
proof for an active migration. Current generation and tests cover only the isolated
user import; see [user import verification](02-user-import.md#verification).
