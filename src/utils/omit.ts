export const omit = <T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> =>
  Object.keys(obj).reduce((acc: Partial<T>, key) => {
    const typedKey = key as K;
    if (!keys.includes(typedKey)) {
      acc[typedKey] = obj[typedKey];
    }

    return acc;
  }, {}) as Omit<T, K>;
