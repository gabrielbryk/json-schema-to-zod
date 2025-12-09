import { JsonSchemaObject, JsonSchema, Refs } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseOneOf = (
  schema: JsonSchemaObject & { oneOf: JsonSchema[] },
  refs: Refs,
) => {
  if (!schema.oneOf.length) {
    return anyOrUnknown(refs);
  }

  if (schema.oneOf.length === 1) {
    return parseSchema(schema.oneOf[0], {
      ...refs,
      path: [...refs.path, "oneOf", 0],
    });
  }

  // Generate parsed schemas for each oneOf option
  const parsedSchemas = schema.oneOf.map((s, i) =>
    parseSchema(s, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    }),
  );

  // Use z.union() for proper type inference, then add superRefine for "exactly one" validation
  // JSON Schema oneOf = exactly one must match (exclusive OR)
  // Zod union = at least one must match (inclusive OR)
  // The superRefine adds the "exactly one" constraint
  return `z.union([${parsedSchemas.join(", ")}]).superRefine((x, ctx) => {
    const schemas = [${parsedSchemas.join(", ")}];
    const errors = schemas.reduce<z.ZodError[]>(
      (errors, schema) =>
        ((result) =>
          result.error ? [...errors, result.error] : errors)(
          schema.safeParse(x),
        ),
      [],
    );
    if (schemas.length - errors.length !== 1) {
      ctx.addIssue({
        path: [],
        code: "invalid_union",
        errors: errors.map(e => e.issues),
        message: "Invalid input: Should pass single schema",
      });
    }
  })`;
};
