// DATA
import vocabulary from './placeTaxonomy.json'

export type PlaceTaxonomyNode = { name: string; label: string; children?: PlaceTaxonomyNode[] }
export const placeTaxonomy: PlaceTaxonomyNode[] = vocabulary.tree

/** Find a publisher category's full navigation path.
 * @param name Exact taxonomy identifier. @param nodes Subtree to search.
 * @returns Root-to-category path, or an empty array for an unknown identifier.
 */
export function placeTaxonomyPath(name: string, nodes = placeTaxonomy): PlaceTaxonomyNode[] {
  for (const node of nodes) {
    if (node.name === name) return [node]
    const child = node.children && placeTaxonomyPath(name, node.children)
    if (child?.length) return [node, ...child]
  }
  return []
}

/** Match a category and all its descendants using the published hierarchy.
 * @param category Selected ancestor. @param primary Candidate's primary category.
 * @returns Whether the candidate belongs to the selected branch.
 */
export function matchesPlaceTaxonomy(category: string, primary?: string | null): boolean {
  return Boolean(primary && placeTaxonomyPath(primary).some(node => node.name === category))
}
