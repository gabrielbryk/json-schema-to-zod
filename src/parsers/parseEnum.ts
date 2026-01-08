import { JsonSchemaObject, SchemaRepresentation, Serializable } from "../Types.js";

export const parseEnum = (
  schema: JsonSchemaObject & { enum: Serializable[] }
): SchemaRepresentation => {
  if (schema.enum.length === 0) {
    return {
      expression: "z.never()",
      type: "z.ZodNever",
    };
  } else if (schema.enum.length === 1) {
    // union does not work when there is only one element
    const value = schema.enum[0];
    return {
      expression: `z.literal(${JSON.stringify(value)})`,
      type: `z.ZodLiteral<${typeof value === "string" ? JSON.stringify(value) : value}>`,
    };
  } else if (schema.enum.every((x) => typeof x === "string")) {
    const values = schema.enum as string[];
    // Zod v4 ZodEnum uses object format: { key: "key"; ... }
    const enumObject = values.map((x) => `${JSON.stringify(x)}: ${JSON.stringify(x)}`).join("; ");
    return {
      expression: `z.enum([${values.map((x) => JSON.stringify(x))}])`,
      type: `z.ZodEnum<{ ${enumObject} }>`,
    };
  } else {
    // Mixed types: create union of literals
    const literalTypes = schema.enum.map((x) =>
      typeof x === "string" ? JSON.stringify(x) : x === null ? "null" : String(x)
    );
    return {
      expression: `z.union([${schema.enum
        .map((x) => `z.literal(${JSON.stringify(x)})`)
        .join(", ")}])`,
      type: `z.ZodUnion<[${literalTypes.map((t) => `z.ZodLiteral<${t}>`).join(", ")}]>`,
    };
  }
};
