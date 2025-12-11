import { JsonSchemaObject, SchemaRepresentation, Serializable } from "../Types.js";

export const parseConst = (
  schema: JsonSchemaObject & { const: Serializable },
): SchemaRepresentation => {
  const value = schema.const;
  const expression = `z.literal(${JSON.stringify(value)})`;

  // Determine the literal type based on the value type
  let type: string;
  if (typeof value === "string") {
    type = `z.ZodLiteral<${JSON.stringify(value)}>`;
  } else if (typeof value === "number") {
    type = `z.ZodLiteral<${value}>`;
  } else if (typeof value === "boolean") {
    type = `z.ZodLiteral<${value}>`;
  } else if (value === null) {
    type = "z.ZodLiteral<null>";
  } else {
    type = "z.ZodLiteral<unknown>";
  }

  return { expression, type };
};
