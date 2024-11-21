export const makeReactive = (arg: Record<string, any>) => {
  let result = $state(arg);
  return result;
};

export const makeReactiveArray = <T>(arg: T[]): T[] => {
  let result = $state(arg);
  return result;
};

export const makeReactivePrimitive = (arg: string | number | boolean) => {
  let result = $state(arg);
  return result;
};
