import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";

export const parseNot = (
  schema: JsonSchemaObject & { not: JsonSchema },
  refs: Refs,
): SchemaRepresentation => {
  const baseSchema = anyOrUnknown(refs);
  const notSchema = parseSchema(schema.not, {
    ...refs,
    path: [...refs.path, "not"],
  });

  return {
    expression: `${baseSchema.expression}.refine((value) => !${notSchema.expression}.safeParse(value).success, "Invalid input: Should NOT be valid against schema")`,
    // In Zod v4, .refine() doesn't change the type
    type: baseSchema.type,
  };
};
