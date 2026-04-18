export const getRequestEvent = () => {
  throw new Error('getRequestEvent not mocked in test')
}

export const query = <T>(_schema: unknown, handler: T): T => handler
export const form = <T>(_schema: unknown, handler: T): T => handler
export const command = <T>(_schema: unknown, handler: T): T => handler
