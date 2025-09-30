// Mock for $app/state
export const page = {
  subscribe: () => () => {},
  url: new URL('http://localhost:3000'),
  params: {},
  route: { id: null },
  status: 200,
  error: null,
  data: {},
  form: null
};
