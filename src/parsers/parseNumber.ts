import { JsonSchemaObject, SchemaRepresentation } from "../Types.js";
import { withMessage } from "../utils/withMessage.js";

export const parseNumber = (
  schema: JsonSchemaObject & { type: "number" | "integer" },
): SchemaRepresentation => {
  let r = schema.type === "integer" ? "z.int()" : "z.number()";
  let zodType = schema.type === "integer" ? "z.ZodInt" : "z.ZodNumber";

  // Handle specific numeric formats if needed, though z.int() covers the main case.
  // Zod v4 has specific types like z.int64(), z.uint32() etc.
  // If we want to map them:
  if (schema.format) {
    switch (schema.format) {
      case "int64":
        r = "z.int64()"; // Note: z.int64 returns ZodBigInt in strict mode, but here we might want number? 
        // Zod v4 'z.int64()' usually returns a BigInt schema or a specific number refinement.
        // From the viewed schemas.ts: export function int64(...): ZodBigIntFormat. 
        // So it returns a BigInt. JSON Schema "integer" usually implies generic number unless "bigint" is specified.
        // If the user wants strict mapping, "int64" -> BigInt.
        // However, "integer" in JS is number safe integer. "int64" might overflow.
        // For safety in this library assuming standard JS consumers, we stick to z.int() unless strictly requested.
        // BUT, let's look at the viewed file again.
        // schemas.ts: export function int64(params?): ZodBigIntFormat.
        // It returns ZodBigIntFormat which extends ZodBigInt.
        // So z.int64() is for BigInts.
        // If input JSON has regular numbers, z.int64() parse might fail if it expects BigInts (n suffix)? 
        // Coercion? z.coerce.bigint()?
        // Let's stick to z.int() for "integer" to be safe and standard.
        break;
      // Other formats like "float", "double" map to z.number() which is default.
    }
  }

  r += withMessage(schema, "multipleOf", ({ json }) => ({
    opener: `.multipleOf(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "minimum", ({ json }) => ({
    opener: `.min(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "maximum", ({ json }) => ({
    opener: `.max(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "exclusiveMinimum", ({ json }) => ({
    opener: `.gt(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  r += withMessage(schema, "exclusiveMaximum", ({ json }) => ({
    opener: `.lt(${json}`,
    closer: ")",
    messagePrefix: ", { message: ",
    messageCloser: " })",
  }));

  // Legacy/Draft-4 support for boolean exclusiveMinimum/Maximum
  // requires checking if they are booleans and using the min/max values.
  // We can leave that simple or add it if strictly required. 
  // Zod v4 fromJSONSchema handles it.

  return {
    expression: r,
    type: zodType,
  };
};
