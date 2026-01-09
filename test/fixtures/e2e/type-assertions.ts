export type Assert<T extends true> = T;
export type IsEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const assertType = <T extends true>(): void => {
  void 0;
};
