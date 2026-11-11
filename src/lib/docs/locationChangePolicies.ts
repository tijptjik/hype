/** Feature-facing value resolution, before the separate editing/adoption workflow. */
export const featureResolvedValueFlow = `flowchart TD
  F[Feature linked to a Location] -->|Community Location| U[Accepted upstream values if available]
  U --> C[Overlay accepted community curations if available]
  F -->|Internal Location| O[Overlay Organisation customizations]
  C --> O
  O --> R[Resolved inherited fields: omitted fields inherit; explicit clears suppress]
  R --> A[Feature display address and marker]
  R --> D[Generate localized display name; fall back to provided name when needed]
  P[Feature properties] --> D
  T[Effective locale-specific template] --> D
  D --> M[Manual Feature name wins when set; otherwise use generated name]
  M --> N[Feature title]
`

/** Incoming changes determine accepted evidence; they never replace displayed values merely by existing. */
export const locationChangeFlow = `flowchart TD
  A[Edit Location fields] --> B{Destination}
  B -->|Internal| C[Save Organisation customizations]
  B -->|Community| L{Every changed field open?}
  L -->|No| K[Reject save; retain existing curations]
  L -->|Yes and authorized| D[Append community curation]
  U[New SaanSeoi evidence] --> E[Apply source-specific field policy]
  D --> E
  E -->|Skip| S[Retain accepted evidence]
  E -->|Review| Q{Eligible empty or unresolved exception?}
  E -->|Accept| V{Evidence valid and dependencies complete?}
  Q -->|Yes| V
  Q -->|No| W[Review; current values stay visible]
  V -->|No| W
  V -->|Yes| R[Accept across the Organisation; release affected customizations]
  W -->|Accept| V
  W -->|Keep current| O[Store retained value as Organisation customization]
  C --> F[Recompute affected Feature display values]
  R --> F
  O --> F
`
