/** Read one published immutable release through the same public contract as the viewer. */
export async function publishedMap(page, id) {
  const pointer = await page.request.get(`/api/premises-maps/${id}`)
  if (!pointer.ok()) throw new Error(`Map unavailable: ${id}`)
  const { url } = await pointer.json()
  const release = await page.request.get(url)
  if (!release.ok()) throw new Error(`Release unavailable: ${id}`)
  return release.json()
}
/** Read approved current occupancy artwork independently of geometry. */
export async function currentMapArtwork(page, id) {
  const response = await page.request.get(`/api/premises-maps/${id}/presentation`)
  if (!response.ok()) throw new Error(`Occupancy unavailable: ${id}`)
  return response.json()
}
