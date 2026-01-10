import { JsonSchemaObject, SchemaRepresentation, Serializable } from "../Types.js";
import { zodEnum, zodLiteral, zodNever, zodUnion } from "../utils/schemaRepresentation.js";

export const parseEnum = (
  schema: JsonSchemaObject & { enum: Serializable[] }
): SchemaRepresentation => {
  if (schema.enum.length === 0) {
    return zodNever();
  } else if (schema.enum.length === 1) {
    // union does not work when there is only one element
    const value = schema.enum[0];
    return zodLiteral(value);
  } else if (schema.enum.every((x) => typeof x === "string")) {
    const values = schema.enum as string[];
    // Zod v4 ZodEnum uses object format: { key: "key"; ... }
    return zodEnum(values, { typeStyle: "object" });
  } else {
    // Mixed types: create union of literals
    return zodUnion(schema.enum.map((value) => zodLiteral(value)));
  }
};
