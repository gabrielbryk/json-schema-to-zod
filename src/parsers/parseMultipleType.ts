import { JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { normalizeUnionMembers } from "../utils/normalizeUnion.js";
import { wrapRecursiveUnion } from "../utils/wrapRecursiveUnion.js";
import { zodNever, zodUnion } from "../utils/schemaRepresentation.js";

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
    return zodNever();
  }

  if (normalized.length === 1) {
    return normalized[0]!;
  }

  return wrapRecursiveUnion(refs, zodUnion(normalized));
};
