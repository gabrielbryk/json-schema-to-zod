import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { normalizeUnionMembers } from "../utils/normalizeUnion.js";

export const parseMultipleType = (
  schema: JsonSchemaObject & { type: string[] },
  refs: Refs
): SchemaRepresentation => {
  const uniqueTypes = Array.from(new Set(schema.type));
  const schemas = uniqueTypes.map((type) =>
    parseSchema({ ...schema, type }, { ...refs, withoutDefaults: true })
  );

  const normalized = normalizeUnionMembers(schemas, { foldNullable: true });
  if (normalized.length === 0) {
    return { expression: "z.never()", type: "z.ZodNever" };
  }

  if (normalized.length === 1) {
    return normalized[0]!;
  }

  const expressions = normalized.map((s) => s.expression).join(", ");
  const types = normalized.map((s) => s.type).join(", ");

  return {
    expression: `z.union([${expressions}])`,
    type: `z.ZodUnion<[${types}]>`,
  };
};
