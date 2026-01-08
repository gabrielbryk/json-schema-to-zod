import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { extractInlineObject } from "../utils/extractInlineObject.js";

export const parseAnyOf = (
  schema: JsonSchemaObject & { anyOf: JsonSchema[] },
  refs: Refs
): SchemaRepresentation => {
  if (!schema.anyOf.length) {
    return anyOrUnknown(refs);
  }

  if (schema.anyOf.length === 1) {
    return parseSchema(schema.anyOf[0], {
      ...refs,
      path: [...refs.path, "anyOf", 0],
    });
  }

  // Rule 1: Extract inline objects to top-level declarations
  const members: SchemaRepresentation[] = schema.anyOf.map((memberSchema, i) => {
    const extracted = extractInlineObject(memberSchema, refs, [...refs.path, "anyOf", i]);
    if (extracted) {
      return { expression: extracted, type: `typeof ${extracted}` };
    }
    return parseSchema(memberSchema, { ...refs, path: [...refs.path, "anyOf", i] });
  });

  const expressions = members.map((m) => m.expression).join(", ");
  const types = members.map((m) => m.type).join(", ");
  const expression = `z.union([${expressions}])`;
  // Use readonly tuple for union type annotations (required for recursive type inference)
  const type = `z.ZodUnion<readonly [${types}]>`;

  return { expression, type };
};
