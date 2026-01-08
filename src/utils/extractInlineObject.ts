import { JsonSchema, JsonSchemaObject, Refs } from "../Types.js";
import { parseSchema } from "../parsers/parseSchema.js";

/**
 * Rule 1 from Zod v4: Put Object Types at Top-Level
 *
 * Extracts inline object schemas to top-level declarations when they have a title.
 * This prevents embedding object schema declarations inside unions/intersections
 * which can break recursive type inference.
 *
 * We extract any titled object schema, including those with:
 * - $refs to other schemas (dependency ordering handles this)
 * - Composition keywords (oneOf/anyOf/allOf for validation or extension)
 *
 * @returns The reference name if extracted, or null if not extractable
 */
export const extractInlineObject = (
  schema: JsonSchema,
  refs: Refs,
  path: (string | number)[]
): string | null => {
  // Skip if not an object
  if (typeof schema !== "object" || schema === null) {
    return null;
  }

  // Skip if it's a $ref - already handled by ref resolution
  if ("$ref" in schema || "$dynamicRef" in schema) {
    return null;
  }

  // Only extract objects with titles
  const title = (schema as JsonSchemaObject).title;
  if (!title) {
    return null;
  }

  const schemaObj = schema as JsonSchemaObject;

  // Must be object-like: explicit type: object with properties
  // Be conservative to avoid creating circular dependencies:
  // - Skip if it has composition keywords (oneOf/anyOf/allOf) - these can create cycles
  // - Skip if any property has a $ref - these can create ordering issues
  if (schemaObj.type !== "object" || !schemaObj.properties) {
    return null;
  }

  // Skip schemas with composition keywords as they can create circular type dependencies
  if (schemaObj.anyOf || schemaObj.oneOf || schemaObj.allOf) {
    return null;
  }

  // Skip if any property has a $ref - these can cause ordering issues
  if (hasNestedRef(schemaObj)) {
    return null;
  }

  // Generate a unique name from the title
  const baseName = sanitizeIdentifier(title);
  const refName = getUniqueName(baseName, refs.usedNames);
  refs.usedNames?.add(refName);

  // Check if already declared
  if (refs.declarations?.has(refName)) {
    return refName;
  }

  // Mark as in progress to handle potential recursion
  refs.inProgress?.add(refName);

  // Parse the schema to get its declaration
  const parsed = parseSchema(schema, {
    ...refs,
    path,
    currentSchemaName: refName,
  });

  refs.inProgress?.delete(refName);

  // Add to declarations with type - parseSchema returns SchemaRepresentation directly
  refs.declarations?.set(refName, parsed);

  // Track dependencies - the extracted schema depends on current, and current depends on extracted
  if (refs.currentSchemaName) {
    const currentDeps = refs.dependencies?.get(refs.currentSchemaName) ?? new Set<string>();
    currentDeps.add(refName);
    refs.dependencies?.set(refs.currentSchemaName, currentDeps);
  }

  return refName;
};

/**
 * Check if a schema contains any $ref - these can cause ordering issues when extracted.
 */
const hasNestedRef = (schema: JsonSchemaObject): boolean => {
  const checkValue = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.some(checkValue);
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.$ref === "string" || typeof obj.$dynamicRef === "string") {
      return true;
    }
    for (const key of Object.keys(obj)) {
      if (checkValue(obj[key])) {
        return true;
      }
    }
    return false;
  };
  return checkValue(schema);
};

const sanitizeIdentifier = (value: string): string => {
  // Convert to PascalCase and remove invalid characters
  const words = value
    .replace(/[^a-zA-Z0-9_$\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const pascalCase = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");

  const cleaned = pascalCase.replace(/^[^a-zA-Z_$]+/, "").replace(/[^a-zA-Z0-9_$]/g, "");
  return cleaned || "InlineSchema";
};

const getUniqueName = (baseName: string, used?: Set<string>): string => {
  if (!used || !used.has(baseName)) {
    return baseName;
  }

  let counter = 2;
  let candidate = `${baseName}${counter}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${baseName}${counter}`;
  }

  return candidate;
};
