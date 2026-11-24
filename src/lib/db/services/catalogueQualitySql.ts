// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// DOMAIN
import {
  LOGO_QUALITIES,
  type LogoQualityFilters,
  type LogoQualityKey,
} from '#lib/locations/catalogueQuality.js'
import { THEMES } from '#lib/themes/themes.js'
/** Build bounded JSON predicates before pagination, keeping missing metadata false.
 * @param filters Explicit three-way choices. @returns SQL against the current revision alias r.
 */
export function catalogueQualitySql(filters: LogoQualityFilters = {}): SQL {
  const live = sql`json_extract(a.value,'$.status')='approved' AND coalesce(json_extract(a.value,'$.src'),'')<>''`
  const logo = sql`(a.key='logo' OR a.key LIKE 'logo-%') AND a.key NOT LIKE '%-format-%'`
  const exists = (condition: SQL): SQL =>
    sql`EXISTS(SELECT 1 FROM json_each(r.content,'$.artwork') a WHERE ${live} AND ${condition})`
  const slot = (name: string): SQL => exists(sql`a.key=${name}`)
  const predicates: Record<LogoQualityKey, SQL> = {
    logo: sql`(coalesce(json_extract(r.content,'$.logo'),'')<>'' OR ${exists(logo)})`,
    svg: exists(sql`${logo} AND json_extract(a.value,'$.format')='svg'`),
    resolution: exists(
      sql`${logo} AND (json_extract(a.value,'$.format')='svg' OR (json_extract(a.value,'$.sourceWidth')>=512 AND json_extract(a.value,'$.sourceHeight')>=512))`,
    ),
    modes: sql`(${slot('marker-light')} AND ${slot('marker-dark')})`,
    themes: sql`(${sql.join(
      THEMES.map(t => slot(`marker-${t.id}`)),
      sql` AND `,
    )})`,
    brandMark: exists(sql`json_extract(a.value,'$.composition')='brand-mark'`),
  }
  const clauses = LOGO_QUALITIES.flatMap(({ key }) =>
    typeof filters[key] === 'boolean'
      ? [sql`(${predicates[key]})=${Number(filters[key])}`]
      : [],
  )
  return clauses.length ? sql.join(clauses, sql` AND `) : sql`1`
}
