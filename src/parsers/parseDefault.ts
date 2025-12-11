import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseDefault = (_schema: JsonSchemaObject, refs?: Refs): SchemaRepresentation => {
  return anyOrUnknown(refs);
};
