import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { extractInlineObject } from "../utils/extractInlineObject.js";
import { normalizeUnionMembers } from "../utils/normalizeUnion.js";
import { wrapRecursiveUnion } from "../utils/wrapRecursiveUnion.js";
import { zodRef, zodUnion } from "../utils/schemaRepresentation.js";

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
      return zodRef(extracted);
    }
    return parseSchema(memberSchema, { ...refs, path: [...refs.path, "anyOf", i] });
  });

  const normalized = normalizeUnionMembers(members, { foldNullable: true });
  if (normalized.length === 0) {
    return anyOrUnknown(refs);
  }

  if (normalized.length === 1) {
    return normalized[0]!;
  }

  const union = zodUnion(normalized, { readonlyType: true });
  return wrapRecursiveUnion(refs, union);
};
