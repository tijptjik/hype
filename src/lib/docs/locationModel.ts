/** Location kind/class taxonomy used by the model documentation. */
export const locationTaxonomy = `flowchart LR
  L["Location"]
  L --> B["kind: built"]
  L --> G["kind: geographic"]
  L --> O["kind: operational"]
  O --> E["class: establishment"]
  O --> SP["class: service_point"]
  L --> A["kind: address"]
  B --> BPT["class: building_part"]
  B --> BS["class: structure"]
  B --> BB["class: building"]
  B --> BP["class: premises"]
  B --> BST["class: thoroughfare"]
  G --> GL["class: landform"]
  G --> GC["class: coastal_feature"]
  G --> GW["class: water_feature"]`

/** Examples of record relationships; arrows do not imply required or exclusive parents. */
export const locationRelationships = `flowchart LR
  E["Establishment"]
  BP["Building part"]
  B["Building"]
  P["Premises / farm estate"]
  A["Address revision"]
  BP -->|"part of · membership"| B
  BP -->|"part of · nested membership"| BP
  B -->|"part of · membership"| P
  E -->|"occupies"| BP
  E -->|"occupies"| B
  E -->|"occupies"| P
  E -->|"addressed by"| A
  BP -->|"addressed by"| A
  B -->|"addressed by"| A
  P -->|"addressed by"| A`

/** Source categories and levels; classification does not assert geographic containment. */
export const divisionTaxonomy = `flowchart TD
  D["Division"]
  D --> AD["Administrative<br/>Level 0: country, sar<br/>Level 1: area<br/>Level 2: district"]
  D --> LO["Locality<br/>Level 1: city<br/>Level 3: town<br/>Level 4: rural_area<br/>Level 5: village<br/>Level 6: hamlet"]
  D --> HO["Hood<br/>Level 4: macrohood<br/>Level 5: neighbourhood<br/>Level 6: microhood"]
  D --> LA["Landform — no level<br/>major_island<br/>minor_island<br/>islet<br/>island_group"]`

/** Address content is compositional; components are not automatic Location identities. */
export const addressComposition = `flowchart LR
  L["Location · building, farm premises or address"] -->|"one or more locationAddress links"| R
  A["Address identity"] -->|"retains versions"| R["Address revision"]
  R -->|"retains"| C["Address content"]
  R --> E["Publication evidence<br/>source version, references, raw source, hash"]
  D["Locally authored draft"] -->|"same content contract"| C
  C --> V["Address content variant · proposed contract"]
  V --> VP["Premises"]
  V --> VC["Cadastral · jurisdiction, system, parcel reference"]
  V --> VL["Linear reference · route, measure, unit, offset"]
  C --> SC["Scope<br/>what the address identifies"]
  C --> G["Optional point geometry"]
  C --> I["Localized components · i18n"]
  I --> P["Premises and phase<br/>premisesName, phaseName, phaseRef, phaseExpression"]
  I --> B["Building and block<br/>buildingName, blockType, blockRef, blockExpression"]
  I --> S["Street and number<br/>streetName, number expression, range and connector"]
  I --> F["Formatted address"]
  C --> U["Optional unit<br/>floorType, floorRef, unitType, unitRef, unitPortion"]
  C --> UI["Unit translations · unitI18n<br/>floorExpression, unitExpression, formattedAddressPart"]
  C --> REF["Optional geographic references<br/>streetId and division IDs"]
  C --> ID["Namespaced identifiers"]`
