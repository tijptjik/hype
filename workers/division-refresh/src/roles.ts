/** Named reference roles from SaanSeoi's division membership contract. */
export const divisionRoles = {
  countryId: ['country'],
  areaId: ['area'],
  districtId: ['district'],
  townId: ['town'],
  ruralAreaId: ['rural_area'],
  macrohoodId: ['macrohood'],
  neighbourhoodId: ['neighbourhood'],
  villageId: ['village'],
  microhoodId: ['microhood'],
  hamletId: ['hamlet'],
  islandId: ['major_island', 'minor_island', 'islet'],
} as const

type Member = {
  id: string
  class: string | null
  hierarchies?: { full: { id: string }[][] }
}

/**
 * Projects unique selected roles without using numeric display levels.
 * @param members Canonical selections; candidate memberships remain stored separately.
 * @returns Nullable role IDs in the same order as divisionRoles.
 * @remarks An island ancestor is removed only when every full path of another island agrees.
 */
export function projectDivisionRoles(members: Member[]): (string | null)[] {
  return Object.entries(divisionRoles).map(([role, classes]) => {
    let candidates = members.filter(member =>
      (classes as readonly string[]).includes(member.class ?? ''),
    )
    // Match SaanSeoi's island projection without choosing a branch by array order.
    if (role === 'islandId') {
      candidates = candidates.filter(
        parent =>
          !candidates.some(
            child =>
              child.id !== parent.id &&
              !!child.hierarchies?.full.length &&
              child.hierarchies.full.every(path =>
                path.some(entry => entry.id === parent.id),
              ),
          ),
      )
    }
    const ids = [...new Set(candidates.map(member => member.id))]
    return ids.length === 1 ? ids[0] : null
  })
}
