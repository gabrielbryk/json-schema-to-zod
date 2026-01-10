import { JsonSchemaObject, SchemaRepresentation, Serializable } from "../Types.js";
import { zodLiteral } from "../utils/schemaRepresentation.js";

export const parseConst = (
  schema: JsonSchemaObject & { const: Serializable }
): SchemaRepresentation => {
  return zodLiteral(schema.const);
};
