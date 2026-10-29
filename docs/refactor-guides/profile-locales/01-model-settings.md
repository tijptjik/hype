# LLM 1 — Locale model and settings

## Assignment

Implement the shared content-locale foundation and ordered Organisation/Project settings described in the [shared specification](../Profile-Locales-Handoff.md). Do not implement Profile UI or migrate UI-message locales.

## Ownership

Own new content-locale model/catalogue utilities; Organisation/Project database and Zod settings schemas; additive migrations; settings API/service read/write paths; inheritance resolver and their focused tests. Keep Project boolean flags intact. Coordinate migration numbering for all workstreams. Do not edit Organisation/Project route UI (LLM 3) or Feature/Location content services (LLM 2).

## Deliverables and handoff

- Canonical `ContentLocale` validation/normalization and explicit legacy aliases, catalogue search records with localized names/autonyms, and safe unknown-name fallback.
- Typed `settings.contentLocales`, preserving array order and other settings; authorized updates and reset-by-key-removal.
- Resolver returning effective ordered locales plus origin (`project`, `organisation`, or `user-default`). Implement the exact four fallback cases in the shared specification.
- Publish exported types, module paths, settings read/write shapes, resolver signature, catalogue query interface, and migration requirements to LLMs 2–4 before they wire production code. Avoid a global widening of existing UI `Locale` types.

## Done when

Focused tests prove normalization/deduplication, validation limits, all defaults, precedence/reset, settings round trips, partial-update preservation, and unauthorized-write rejection. Document any compatibility/migration risk. Shared defaults remain distinct from form-local chip state.
