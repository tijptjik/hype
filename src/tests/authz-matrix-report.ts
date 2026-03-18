import { createPolicyMatrixReporter } from './policy-matrix-report'

type MatrixRow = {
  action: string
  scenario: string
  actor: string
  expected: boolean
  actual: boolean
  code?: string
}

export const createAuthzMatrixReporter = (title: string) => {
  const reporter = createPolicyMatrixReporter(title)

  return {
    record: (row: MatrixRow): void => reporter.recordAction(row),
    flush: reporter.flush,
  }
}
