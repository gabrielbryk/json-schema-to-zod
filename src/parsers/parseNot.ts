import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { zodRefine } from "../utils/schemaRepresentation.js";

export const parseNot = (
  schema: JsonSchemaObject & { not: JsonSchema },
  refs: Refs
): SchemaRepresentation => {
  const baseSchemaInput: JsonSchemaObject = { ...schema };
  delete (baseSchemaInput as { not?: JsonSchema }).not;
  const baseSchema = parseSchema(baseSchemaInput, refs, true);
  if (!baseSchema.node) {
    throw new Error("SchemaRepresentation node missing (no-fallback mode).");
  }
  const resolvedBase = baseSchema.node.kind === "never" ? anyOrUnknown(refs) : baseSchema;
  const notSchema = parseSchema(schema.not, {
    ...refs,
    path: [...refs.path, "not"],
  });

  return zodRefine(
    resolvedBase,
    `(value) => !${notSchema.expression}.safeParse(value).success, "Invalid input: Should NOT be valid against schema"`
  );
};
