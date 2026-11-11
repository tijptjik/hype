/** Shared setup, discovery and review decisions in the Feature creation flow. */
export const locationMatchingStages = `flowchart TD
  A["1 · Choose map / layer"] --> B["2 · Choose enabled Feature type<br/>A sole available choice is determined automatically"]
  B --> C["3 · Choose what Location to match<br/>A sole visible context is determined automatically"]
  C --> D{"4 · Find a Location"}
  D -->|"Search"| E["Search names or addresses"]
  D -->|"Map / nearby"| F["Set a pin and inspect nearby results"]
  E --> G{"Review candidate"}
  F --> G
  G -->|"Same intended identity and allowed kind"| H["Use existing Location"]
  G -->|"Useful address or host only"| I["Create intended Location here<br/>Review copied data and explicit relationships"]
  G -->|"Wrong or ambiguous"| D
  G -->|"No suitable result"| J["Enter local details / adjust pin"]
  G -->|"Lookup failed"| K["Retry or revise search<br/>Failure is not evidence of no match"]
  K --> D
  J --> L["Review local Location or unresolved association<br/>according to the effective policy"]
  H --> M["5 · Review identity, names, address and placement"]
  I --> M
  L --> M
  M --> N{"Required association satisfied?"}
  N -->|"No"| D
  N -->|"Yes / optional"| O["Save Feature<br/>Server validates policy and persists reviewed association"]`

/** Worked examples illustrate policy choices, not a fixed catalogue of installed types. */
export const locationMatchingExamples = [
  {
    id: 'bookshop',
    title: 'bookStore / bakery',
    description:
      'Example: a place Feature represents an establishment. Both bookStore and bakery follow this flow. Match the business branch; its shop unit, building and address are useful starting records when the establishment is missing.',
    source: `flowchart TD
  A["bookStore / bakery · place / represents"] --> B["Target: establishment"]
  B --> C["Search shop name or address / inspect nearby"]
  C --> D{"What did you find?"}
  D -->|"Same bookstore or bakery branch"| E["Use existing establishment"]
  D -->|"Building part, building, premises or address"| F["Create establishment here"]
  D -->|"Different shop / uncertain branch"| C
  D -->|"Nothing suitable"| G["Enter shop name, address and pin locally"]
  F --> H{"Known physical host?"}
  H -->|"Yes"| I["Review explicit Operates in relationship"]
  H -->|"No"| J["Keep host unresolved"]
  G --> J
  E --> K["Review linked identity and placement"]
  I --> K
  J --> K
  K --> L["Apply required-association policy and save"]`,
    note: 'A former occupant and its successor are different establishments. A matching shop address does not establish that they are the same bookstore or bakery.',
  },
  {
    id: 'oldTree',
    title: 'oldTree',
    description:
      'Example: an object Feature is locatedAt a premises or address. The tree remains the Feature subject; the selected Location identifies its setting.',
    source: `flowchart TD
  A["oldTree · object / locatedAt"] --> B{"Choose setting to match"}
  B -->|"Park / estate / site"| C["Target: premises"]
  B -->|"Address only"| D["Target: address"]
  C --> E["Search setting name or address / inspect nearby"]
  D --> E
  E --> F{"Suitable setting of selected kind?"}
  F -->|"Yes"| G["Use existing Location"]
  F -->|"Other kind, useful position or address"| H["Use as starting point for selected context"]
  F -->|"Wrong setting / ambiguous"| E
  F -->|"No"| I["Enter local setting details and tree pin"]
  G --> J["Review tree placement separately from host centre"]
  H --> J
  I --> J
  J --> K["Keep tree name on Feature<br/>Apply association policy and save"]`,
    note: 'The current setup hides geographic and thoroughfare contexts. A tree is not automatically a landform; this example uses a visible setting context and does not add a tree Location class.',
  },
  {
    id: 'ghostSign',
    title: 'ghostSign',
    description:
      'Example: an object Feature is locatedAt a building part, building, structure or address. Choose the surviving physical setting of the sign.',
    source: `flowchart TD
  A["ghostSign · object / locatedAt"] --> B{"What carries the sign?"}
  B -->|"Identifiable part"| C["Target: building_part"]
  B -->|"Whole building"| D["Target: building"]
  B -->|"Freestanding constructed host"| E["Target: structure"]
  B -->|"Only address known"| F["Target: address"]
  C --> G["Search / inspect nearby for selected context"]
  D --> G
  E --> G
  F --> G
  G --> H{"Candidate matches intended host?"}
  H -->|"Yes"| I["Use existing host Location"]
  H -->|"Address / occupant / other starting record"| J["Create intended host here<br/>Review part and building evidence where relevant"]
  H -->|"Uncertain"| G
  H -->|"No result"| K["Enter local host details and sign pin"]
  I --> L["Review sign name and exact placement<br/>Apply association policy and save"]
  J --> L
  K --> L`,
    note: 'The business named on the sign is historical evidence, not automatically the current host or a current establishment association. Unit text alone does not prove a building-part identity.',
  },
  {
    id: 'waterDispenser',
    title: 'waterDispenser',
    description:
      'Two possible configurations: an object locatedAt its host, or a place representing a continuing drinking-water service point. The configured Feature type fixes this relation before matching.',
    source: `flowchart TD
  A["waterDispenser"] --> B{"Configured subject and relation"}
  B -->|"Physical dispenser · object / locatedAt"| C["Choose allowed host context<br/>e.g. building_part, building, premises or address"]
  B -->|"Water service · place / represents"| D["Target: service_point"]
  C --> E["Search host name or address / inspect nearby"]
  D --> F["Search service point / inspect nearby"]
  E --> G{"Same host of selected kind?"}
  G -->|"Yes"| H["Use host Location; place Feature at dispenser"]
  G -->|"No"| I["Use starting record or enter local host details"]
  F --> J{"Same continuing water service?"}
  J -->|"Yes"| K["Use existing service point"]
  J -->|"Host establishment, built place or address only"| L["Create service point here<br/>Review optional Operates in host"]
  J -->|"No result"| M["Enter local service details and pin"]
  H --> N["Review identity, address and placement<br/>Apply association policy and save"]
  I --> N
  K --> N
  L --> N
  M --> N`,
    note: 'Replacing a dispenser does not necessarily replace the continuing water service. If a result is ambiguous, return to search; a nearby host is not itself the service point.',
  },
  {
    id: 'publicToilet',
    title: 'publicToilet',
    description:
      'Example: a place Feature represents the public toilet service or its physical space. Offer only the contexts that the project intends contributors to distinguish.',
    source: `flowchart TD
  A["publicToilet · place / represents"] --> B{"Which identity is being recorded?"}
  B -->|"Continuing public service"| C["Target: service_point"]
  B -->|"Dedicated toilet building"| D["Target: building"]
  B -->|"Toilet space within building"| E["Target: building_part"]
  C --> F["Search facility name / address / nearby"]
  D --> F
  E --> F
  F --> G{"Same identity and selected kind?"}
  G -->|"Yes"| H["Use existing Location"]
  G -->|"Host or address only"| I["Create selected kind here"]
  G -->|"Uncertain / another facility"| F
  G -->|"Nothing suitable"| J["Enter local details and pin"]
  I --> K["Service: review Operates in host<br/>Building part: review enclosing building / parts"]
  J --> K
  H --> L["Review identity, names, address and placement"]
  K --> L
  L --> M["Apply association policy and save"]`,
    note: 'A service point, its room and its building are separate identities. Choosing a building as a starting point for a service does not make that building the toilet service.',
  },
] as const
