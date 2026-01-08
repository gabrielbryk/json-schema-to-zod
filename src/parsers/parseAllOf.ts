import { parseSchema } from "./parseSchema.js";
import { half } from "../utils/half.js";
import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";

const originalIndexKey = "__originalIndex";

/**
 * Check if a schema defines object properties (inline object shape) without any refs.
 */
const isInlineObjectOnly = (schema: JsonSchema): schema is JsonSchemaObject & { properties: Record<string, JsonSchema> } => {
  if (typeof schema !== "object" || schema === null) return false;
  const obj = schema as JsonSchemaObject;
  // Must have properties
  if (!obj.properties || Object.keys(obj.properties).length === 0) return false;
  // Must NOT have $ref or $dynamicRef (can't use spread with refs)
  if (obj.$ref || obj.$dynamicRef) return false;
  return true;
};

/**
 * Parse just the shape entries from an object schema (without z.object wrapper).
 * Returns array of "key: expression" strings for spreading.
 */
const parseObjectShape = (
  schema: JsonSchemaObject & { properties: Record<string, JsonSchema> },
  refs: Refs,
  pathPrefix: (string | number)[]
): { shapeEntries: string[]; shapeTypes: string[] } => {
  const shapeEntries: string[] = [];
  const shapeTypes: string[] = [];

  for (const key of Object.keys(schema.properties)) {
    const propSchema = schema.properties[key];
    const parsedProp = parseSchema(propSchema, {
      ...refs,
      path: [...pathPrefix, "properties", key],
    });

    const hasDefault = typeof propSchema === "object" && propSchema.default !== undefined;
    const required = Array.isArray(schema.required)
      ? schema.required.includes(key)
      : typeof propSchema === "object" && propSchema.required === true;
    const optional = !hasDefault && !required;

    const valueExpr = optional
      ? `${parsedProp.expression}.exactOptional()`
      : parsedProp.expression;
    const valueType = optional
      ? `z.ZodExactOptional<${parsedProp.type}>`
      : parsedProp.type;

    shapeEntries.push(`${JSON.stringify(key)}: ${valueExpr}`);
    shapeTypes.push(`${JSON.stringify(key)}: ${valueType}`);
  }

  return { shapeEntries, shapeTypes };
};

/**
 * Check if all allOf members can be combined using spread syntax.
 * Only works when ALL members are inline objects (no $refs).
 * Returns the merged object if possible, undefined otherwise.
 */
const trySpreadPattern = (
  allOfMembers: JsonSchema[],
  refs: Refs
): { expression: string; type: string } | undefined => {
  const shapeEntries: string[] = [];
  const shapeTypes: string[] = [];

  for (let i = 0; i < allOfMembers.length; i++) {
    const member = allOfMembers[i];
    const idx = (member as JsonSchemaObject & { [originalIndexKey]?: number })[originalIndexKey] ?? i;

    // Only handle pure inline objects - no refs allowed
    if (!isInlineObjectOnly(member)) {
      return undefined;
    }

    // Extract shape entries from inline object
    const { shapeEntries: entries, shapeTypes: types } = parseObjectShape(
      member,
      refs,
      [...refs.path, "allOf", idx]
    );
    shapeEntries.push(...entries);
    shapeTypes.push(...types);
  }

  if (shapeEntries.length === 0) return undefined;

  return {
    expression: `z.looseObject({ ${shapeEntries.join(", ")} })`,
    type: `z.ZodObject<{ ${shapeTypes.join(", ")} }>`,
  };
};

const ensureOriginalIndex = (arr: JsonSchema[]) => {
  const newArr: (JsonSchemaObject & { [originalIndexKey]: number })[] = [];

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item === "boolean") {
      newArr.push(
        item ? { [originalIndexKey]: i } : { [originalIndexKey]: i, not: {} },
      );
    } else if (
      typeof item === "object" &&
      item !== null &&
      originalIndexKey in item
    ) {
      return arr as (JsonSchemaObject & { [originalIndexKey]: number })[];
    } else {
      newArr.push({ ...(item as JsonSchemaObject), [originalIndexKey]: i });
    }
  }

  return newArr;
};

export function parseAllOf(
  schema: JsonSchemaObject & { allOf: JsonSchema[] },
  refs: Refs,
): SchemaRepresentation {
  if (schema.allOf.length === 0) {
    return { expression: "z.never()", type: "z.ZodNever" };
  } else if (schema.allOf.length === 1) {
    const item = schema.allOf[0];

    const parsed = parseSchema(item, {
      ...refs,
      path: [
        ...refs.path,
        "allOf",
        (item as JsonSchemaObject & { [originalIndexKey]?: number })[
        originalIndexKey
        ] ?? 0,
      ],
    });



    return parsed;
  } else {
    // Try spread pattern first (more efficient than intersection)
    // This works when all members are either $refs to object schemas or inline objects
    const indexed = ensureOriginalIndex(schema.allOf);
    const spreadResult = trySpreadPattern(indexed, refs);
    if (spreadResult) {
      return spreadResult;
    }

    // Fallback to intersection-based approach
    const [left, right] = half(indexed);

    const leftResult = parseAllOf({ allOf: left }, refs);
    const rightResult = parseAllOf({ allOf: right }, refs);

    return {
      expression: `z.intersection(${leftResult.expression}, ${rightResult.expression})`,
      type: `z.ZodIntersection<${leftResult.type}, ${rightResult.type}>`,
    };
  }
}
