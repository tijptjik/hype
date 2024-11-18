import * as domTestingLib from '@testing-library/dom';

const { queryHelpers } = domTestingLib;

export const queryByTestId = queryHelpers.queryByAttribute.bind(
  null,
  'data-test-id',
)
export const queryAllByTestId = queryHelpers.queryAllByAttribute.bind(
  null,
  'data-test-id',
)

export function getAllByTestId(container, id, ...rest) {
  const els = queryAllByTestId(container, id, ...rest)
  if (!els.length) {
    throw queryHelpers.getElementError(
      `Unable to find an element by: [data-test-id="${id}"]`,
      container,
    )
  }
  return els
}

export function getByTestId(container, id, ...rest) {
  // result >= 1
  const result = getAllByTestId(container, id, ...rest)
  if (result.length > 1) {
    throw queryHelpers.getElementError(
      `Found multiple elements with the [data-test-id="${id}"]`,
      container,
    )
  }
  return result[0]
}

// re-export with overrides
export default {
  ...domTestingLib,
  getByTestId,
  getAllByTestId,
  queryByTestId,
  queryAllByTestId,
}