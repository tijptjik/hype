export const getRequestEvent = () => {
  throw new Error('getRequestEvent not mocked in test')
}

export const query = Object.assign(<T>(_schema: unknown, handler: T): T => handler, {
  batch:
    (
      _schema: unknown,
      handler: (inputs: unknown[]) => Promise<(input: unknown) => unknown>,
    ) =>
    async (input: unknown) =>
      (await handler([input]))(input),
})
export const requested = () => ({ refreshAll: async () => {} })
export const form = <T>(_schema: unknown, handler: T): T => handler
export const command = <T>(_schema: unknown, handler: T): T => handler
