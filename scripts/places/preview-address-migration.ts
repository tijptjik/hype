// NODE
import { readFileSync, writeFileSync } from 'node:fs'
// SQLITE
import { Database } from 'bun:sqlite'
// ADDRESS CONTRACT
import { createLocalPlaceAddress } from '../../src/lib/addresses/localPlaceAddress'
import {
  emptyFeatureAddress,
  getAddressDisplay,
} from '../../src/lib/addresses/featureAddress'

/** Produce a private display-first migration preview, without accepting Place candidates.
 * @returns Nothing; writes JSON plus a short Markdown review sample.
 * @remarks Candidate labels are 2D source evidence, not accepted Feature displays.
 * Unit inventory and Feature overrides must be reviewed before adoption.
 */
function main(): void {
  const [planPath, candidatesPath, sourcePath, output] = Bun.argv.slice(2)
  if (!planPath || !candidatesPath || !sourcePath || !output)
    throw new Error(
      'Usage: preview-address-migration.ts SPLIT.json CANDIDATES.json SAANSEOI.sqlite OUTPUT_PREFIX',
    )
  process.umask(0o077)
  const plan = JSON.parse(readFileSync(planPath, 'utf8'))
  const evidence = JSON.parse(readFileSync(candidatesPath, 'utf8'))
  const db = new Database(sourcePath, { readonly: true })
  db.exec('BEGIN')
  try {
    const publication = db
      .query(
        "SELECT snapshotId,addressSnapshotId,supplementaryAddressSnapshotId FROM placePublicationState WHERE status='current'",
      )
      .all() as {
      snapshotId: string
      addressSnapshotId: string
      supplementaryAddressSnapshotId: string
    }[]
    if (publication.length !== 1 || publication[0].snapshotId !== evidence.snapshotId)
      throw new Error('Candidate publication changed')
    const snapshots = [
      publication[0].addressSnapshotId,
      publication[0].supplementaryAddressSnapshotId,
    ]
    const candidates = new Map(evidence.records.map((r: any) => [r.featureId, r]))
    let changed = 0,
      missingSourceAddresses = 0
    const rows = plan.plans.flatMap((item: any) => {
      const record: any = candidates.get(item.featureId)
      const candidate =
        record?.state === 'review'
          ? record.candidates.find((c: any) => c.evidence.exactLocalizedName)
          : null
      const sourceRows = candidate?.address2dId
        ? (db
            .query(
              `SELECT i.locale,i.formattedAddress FROM address2dI18n i JOIN addressPublicationState s ON s.scopeId=i.scopeId WHERE i.addressId=? AND s.status='current' AND s.snapshotId IN (?,?)`,
            )
            .all(candidate.address2dId, ...snapshots) as {
            locale: string
            formattedAddress: string
          }[])
        : []
      if (candidate && !sourceRows.length) missingSourceAddresses++
      const labels = item.facts.location.address.fallbackDisplay
      const structured = emptyFeatureAddress()
      structured.source.authored = createLocalPlaceAddress(labels)
      return Object.entries(labels).map(([locale, before]) => {
        const hypeLocale =
          locale === 'zh-hant' ? 'zhHant' : locale === 'zh-hans' ? 'zhHans' : locale
        const after = getAddressDisplay(structured, hypeLocale as never)
        if (before !== after) changed++
        return {
          featureId: item.featureId,
          names: item.facts.names,
          locale,
          before,
          afterStructuredLocal: after,
          displayChanged: before !== after,
          candidatePlaceId: candidate?.id ?? null,
          candidateDistanceMetres: candidate?.distanceMetres ?? null,
          candidateAddress2d:
            sourceRows.find(r => r.locale === locale)?.formattedAddress ?? null,
          candidateFreeform: candidate?.addresses?.[locale] ?? null,
          candidateNeedsUnitReview: Boolean(candidate?.address3dUnitId),
          disposition: candidate ? 'review-identity-and-address' : 'unresolved-local',
        }
      })
    })
    const summary = {
      features: plan.plans.length,
      localizedDisplays: rows.length,
      structuredLocalDisplayChanges: changed,
      candidatesMissingCanonicalAddress: missingSourceAddresses,
      candidateMatching: evidence.summary,
    }
    writeFileSync(`${output}.json`, JSON.stringify({ summary, rows }, null, 2))
    const escape = (v: unknown): string =>
      String(v ?? '—')
        .replaceAll('|', '\\|')
        .replaceAll('\n', ' ')
    const sample = rows
      .filter((r: any) => r.locale === 'en' && r.candidatePlaceId)
      .sort(
        (a: any, b: any) =>
          Number(Boolean(b.candidateAddress2d)) - Number(Boolean(a.candidateAddress2d)),
      )
      .slice(0, 30)
    writeFileSync(
      `${output}.md`,
      `# Address migration display preview\n\nPrivate source-data report. No candidate identities or addresses have been accepted.\n\n${JSON.stringify(summary, null, 2)}\n\nThe local structured conversion preserves the existing text. Candidate 2D labels are evidence only: unit/floor details, missing translations and Feature overrides need review.\n\n| Feature | Existing display | Structured local display | Candidate 2D display (unaccepted) | Distance (m) |\n|---|---|---|---|---|\n${sample
        .map((r: any) =>
          [
            r.names.en ?? r.featureId,
            r.before,
            r.afterStructuredLocal,
            r.candidateAddress2d,
            r.candidateDistanceMetres,
          ]
            .map(escape)
            .join(' | '),
        )
        .map((line: string) => `| ${line} |`)
        .join('\n')}\n`,
    )
    console.log(JSON.stringify(summary))
  } finally {
    db.close()
  }
}
main()
