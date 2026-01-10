import type { Refs, SchemaRepresentation } from "../Types.js";
import { zodAny, zodUnknown } from "./schemaRepresentation.js";

/**
 * Returns a SchemaRepresentation for z.unknown() if the useUnknown option is enabled,
 * otherwise returns a SchemaRepresentation for z.any().
 * This helper is used throughout the library for fallback cases.
 *
 * @param refs - The refs object containing options
 * @returns The appropriate Zod schema representation
 */
export const anyOrUnknown = (refs?: Refs): SchemaRepresentation => {
  return refs?.useUnknown ? zodUnknown() : zodAny();
};
