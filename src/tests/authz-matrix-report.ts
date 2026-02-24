type MatrixRow = {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}

const shouldPrintAuthzMatrix = (): boolean => {
  const value = process.env.AUTHZ_MATRIX_PRINT?.toLowerCase()
  return value === '1' || value === 'true'
}

const toCell = (value: string): string => value.replaceAll('|', '\\|')

export const createAuthzMatrixReporter = (title: string) => {
  const rows: MatrixRow[] = []

  const record = (row: MatrixRow): void => {
    rows.push(row)
  }

  const flush = (): void => {
    if (!shouldPrintAuthzMatrix() || rows.length === 0) return

    const lines = [
      '',
      `AUTHZ Matrix: ${title}`,
      '| Action | Scenario | Actor | Expected | Actual | Pass | Code |',
      '| --- | --- | --- | ---: | ---: | --- | --- |',
      ...rows.map(row => {
        const pass = row.expected === row.actual
        return `| ${toCell(row.action)} | ${toCell(row.scenario)} | ${toCell(
          row.actor,
        )} | ${row.expected ? 'ALLOW' : 'DENY'} | ${row.actual ? 'ALLOW' : 'DENY'} | ${
          pass ? 'PASS' : 'FAIL'
        } | ${toCell(row.code ?? '')} |`
      }),
    ]

    console.log(lines.join('\n'))
  }

  return { record, flush }
}
