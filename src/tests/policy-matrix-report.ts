type ActionRow = {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}

type FieldRow = {
  action: string
  fieldGroup: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}

type ValidationRow = {
  flow: string
  rule: string
  expected: string
  actual: string
  code?: string
}

const shouldPrintPolicyMatrix = (): boolean => {
  const value = process.env.AUTHZ_MATRIX_PRINT?.toLowerCase()
  return value === '1' || value === 'true'
}

const toCell = (value: string): string => value.replaceAll('|', '\\|')

export const createPolicyMatrixReporter = (title: string) => {
  const actionRows: ActionRow[] = []
  const fieldRows: FieldRow[] = []
  const validationRows: ValidationRow[] = []

  const recordAction = (row: ActionRow): void => {
    actionRows.push(row)
  }

  const recordField = (row: FieldRow): void => {
    fieldRows.push(row)
  }

  const recordValidation = (row: ValidationRow): void => {
    validationRows.push(row)
  }

  const flush = (): void => {
    if (!shouldPrintPolicyMatrix()) return

    const lines: string[] = ['', `Policy Matrix: ${title}`]

    if (actionRows.length > 0) {
      lines.push('', '### Action-Level Matrix')
      lines.push('| Action | Scenario | Actor | Expected | Actual | Pass | Code |')
      lines.push('| --- | --- | --- | ---: | ---: | --- | --- |')
      lines.push(
        ...actionRows.map(row => {
          const pass = row.expected === row.actual
          return `| ${toCell(row.action)} | ${toCell(row.scenario)} | ${toCell(
            row.actor,
          )} | ${row.expected ? 'ALLOW' : 'DENY'} | ${
            row.actual ? 'ALLOW' : 'DENY'
          } | ${pass ? 'PASS' : 'FAIL'} | ${toCell(row.code ?? '')} |`
        }),
      )
    }

    if (fieldRows.length > 0) {
      lines.push('', '### Field-Level Matrix')
      lines.push('| Action | Field group | Actor | Expected | Actual | Pass | Code |')
      lines.push('| --- | --- | --- | ---: | ---: | --- | --- |')
      lines.push(
        ...fieldRows.map(row => {
          const pass = row.expected === row.actual
          return `| ${toCell(row.action)} | ${toCell(row.fieldGroup)} | ${toCell(
            row.actor,
          )} | ${row.expected ? 'ALLOW' : 'DENY'} | ${
            row.actual ? 'ALLOW' : 'DENY'
          } | ${pass ? 'PASS' : 'FAIL'} | ${toCell(row.code ?? '')} |`
        }),
      )
    }

    if (validationRows.length > 0) {
      lines.push('', '### Validation/Integrity Matrix')
      lines.push('| Flow | Rule | Expected result | Actual result | Pass | Code |')
      lines.push('| --- | --- | --- | --- | --- | --- |')
      lines.push(
        ...validationRows.map(row => {
          const pass = row.expected === row.actual
          return `| ${toCell(row.flow)} | ${toCell(row.rule)} | ${toCell(
            row.expected,
          )} | ${toCell(row.actual)} | ${pass ? 'PASS' : 'FAIL'} | ${toCell(
            row.code ?? '',
          )} |`
        }),
      )
    }

    console.log(lines.join('\n'))
  }

  return {
    recordAction,
    recordField,
    recordValidation,
    flush,
  }
}
