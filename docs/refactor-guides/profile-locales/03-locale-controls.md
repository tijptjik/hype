# LLM 3 — Locale controls and Advanced settings UI

## Assignment

Build the shared ordered locale controls and Organisation/Project Advanced editors from
the [shared specification](../Profile-Locales-Handoff.md). Consume LLM 1's
locale/catalogue/settings interfaces. Do not edit the Feature route or Profile fields.

## Ownership

Own new reusable locale-toolbar/search/order components, their accessibility/interaction
fixtures and tests, and Organisation/Project Advanced route UI. LLM 1 owns their
settings backend; LLM 4 consumes the toolbar in Profile.

## Deliverables and handoff

- Controlled toolbar with ordered selected locales, visible locale set, expanded state,
  Add/search, toggle and reorder events. Caller owns state/persistence.
- Rightward expansion, wrapping, reduced-motion support, keyboard/touch reorder
  alternatives, and protection against zero visible locales.
- Search by canonical tag, legacy alias, localized language name, and autonym; duplicate
  selection reveals an existing locale rather than appending it.
- Shared default editor with effective order, inheritance origin, explicit Project
  override, and Reset to inherited. Do not write derived defaults merely by opening the
  form.
- Publish component paths and props/events, focus behavior, and example fixture usage to
  LLM 4. Toolbar visibility never modifies content values.

## Done when

Interaction tests cover add, duplicate selection, hide/reveal, reorder, keyboard
operation, and controlled-state updates. Browser-check 320px, 390px, desktop, and
reduced motion. Verify Advanced settings save/reload against LLM 1's backend; clearly
distinguish fixture-only evidence if authentication is unavailable.
