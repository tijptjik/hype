# LLM 2 — Dynamic content persistence

## Assignment

Make additional Feature and Location content locales survive the complete data path. Read the [shared specification](../Profile-Locales-Handoff.md) and consume LLM 1's canonical locale contract. Do not build locale selection or Profile UI.

## Ownership

Own Feature/Location content schemas, API/service serialization, locale-map adapters, copy/clone/read projections, name inheritance/provenance, and translation-provider adapters. Own relevant data-path tests. Coordinate shared `constraints.ts` edits and any migration through LLM 1. LLM 4 owns the Feature page, client draft-state wiring, and translation orchestration; provide the required interfaces instead of editing that page.

## Deliverables and handoff

- Dynamic locale maps with explicit adapters for existing en/zhHant/zhHans forms and stored tag variants; no silent stripping of new locales.
- Fourth-locale save/reload, preservation during unrelated edits, and read projection with unchanged verification metadata.
- Dynamic Location-name projection for inherited Feature titles; no fallback-language copy masquerading as a translation.
- Provider contract to translate one field from one source tag to one target tag, exposing unsupported language pairs and errors. LLM 4 orchestrates all-empty-target fanout; the provider adapter must not overwrite form state.
- Publish read/write form shapes, empty-value semantics, provider signatures, and compatibility notes for LLM 4. Include requirements for draft recovery to preserve dynamic values.

## Done when

Tests cover old records and at least one additional locale through persistence, cloning, unrelated updates, and inherited-name projection. Inspect actual database constraints and detect normalization collisions before any data migration. Unsupported automatic translation must not prevent manual content storage. Keep UI-language compilation unchanged.
