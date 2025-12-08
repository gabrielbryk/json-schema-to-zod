/**
 * Post-processor for Zod's z.toJSONSchema() output.
 *
 * When `preserveJsonSchemaForRoundTrip` was used during JSON Schema → Zod conversion,
 * this function reconstructs the original JSON Schema features from the stored __jsonSchema meta.
 *
 * Usage:
 * 1. Convert JSON Schema to Zod code with `preserveJsonSchemaForRoundTrip: true`
 * 2. Evaluate the Zod code to get a schema instance
 * 3. Call Zod's `z.toJSONSchema(schema)` to get JSON Schema output
 * 4. Pass that output to `reconstructJsonSchema()` to restore preserved features
 *
 * Handles:
 * - patternProperties (stored in __jsonSchema.patternProperties)
 * - if/then/else conditionals (stored in __jsonSchema.conditional)
 */

type JsonSchemaObject = Record<string, unknown>;

/**
 * Recursively process a JSON Schema to reconstruct original features from __jsonSchema meta.
 *
 * Handles special cases:
 * - allOf[object, {__jsonSchema: {conditional: ...}}] -> object with if/then/else at top level
 * - patternProperties meta -> patternProperties at current level
 */
export function reconstructJsonSchema(schema: JsonSchemaObject): JsonSchemaObject {
  if (typeof schema !== "object" || schema === null) {
    return schema;
  }

  const result = { ...schema };

  // Handle allOf structures created by .and() with conditionals
  // Pattern: allOf: [mainSchema, {__jsonSchema: {conditional: ...}, anyOf: [...]}]
  if (
    Array.isArray(result.allOf) &&
    result.allOf.length === 2 &&
    typeof result.allOf[1] === "object" &&
    result.allOf[1] !== null
  ) {
    const secondElement = result.allOf[1] as JsonSchemaObject;

    // Check if second element has conditional meta
    if (
      secondElement.__jsonSchema &&
      typeof secondElement.__jsonSchema === "object" &&
      (secondElement.__jsonSchema as JsonSchemaObject).conditional
    ) {
      // Extract the main schema and conditional
      const mainSchema = reconstructJsonSchema(
        result.allOf[0] as JsonSchemaObject,
      );
      const conditionalMeta = (secondElement.__jsonSchema as JsonSchemaObject)
        .conditional as {
        if: unknown;
        then: unknown;
        else: unknown;
      };

      // Merge: main schema + if/then/else at top level
      const merged: JsonSchemaObject = {
        ...mainSchema,
        if: conditionalMeta.if,
        then: conditionalMeta.then,
        else: conditionalMeta.else,
      };

      // Recursively process the merged result
      return reconstructJsonSchema(merged);
    }
  }

  // Check for __jsonSchema meta at this level
  if (result.__jsonSchema && typeof result.__jsonSchema === "object") {
    const preserved = result.__jsonSchema as JsonSchemaObject;

    // Reconstruct patternProperties
    if (preserved.patternProperties) {
      result.patternProperties = preserved.patternProperties;
    }

    // Reconstruct if/then/else conditional (for non-allOf cases)
    if (preserved.conditional) {
      const conditional = preserved.conditional as {
        if: unknown;
        then: unknown;
        else: unknown;
      };
      result.if = conditional.if;
      result.then = conditional.then;
      result.else = conditional.else;
    }

    // Remove the __jsonSchema meta from the output
    delete result.__jsonSchema;
  }

  // Recursively process nested schemas
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === "object" && item !== null
            ? reconstructJsonSchema(item as JsonSchemaObject)
            : item,
        );
      } else {
        result[key] = reconstructJsonSchema(value as JsonSchemaObject);
      }
    }
  }

  return result;
}
