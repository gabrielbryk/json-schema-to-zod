import { JsonSchemaObject, Refs } from "../Types.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseDefault = (_schema: JsonSchemaObject, refs?: Refs) => {
  return anyOrUnknown(refs);
};
