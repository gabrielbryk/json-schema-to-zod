import type { Refs } from "../Types.js";

/**
 * Returns "z.unknown()" if the useUnknown option is enabled, otherwise "z.any()".
 * This helper is used throughout the library for fallback cases.
 *
 * @param refs - The refs object containing options
 * @returns The appropriate Zod schema string
 */
export const anyOrUnknown = (refs?: Refs): string => {
  return refs?.useUnknown ? "z.unknown()" : "z.any()";
};
