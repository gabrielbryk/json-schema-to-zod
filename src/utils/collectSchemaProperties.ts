import { JsonSchemaObject, JsonSchema, Refs } from "../Types.js";
import { resolveRef } from "./resolveRef.js";

export type CollectedSchemaProperties = {
  properties: Record<string, JsonSchema>;
  required: string[];
  propertyPaths: Record<string, (string | number)[]>;
};

const mergeProperties = (
  target: Record<string, JsonSchema>,
  targetPaths: Record<string, (string | number)[]>,
  props: Record<string, JsonSchema>,
  basePath: (string | number)[]
) => {
  for (const [key, schema] of Object.entries(props)) {
    if (!(key in target)) {
      target[key] = schema;
      targetPaths[key] = [...basePath, "properties", key];
    }
  }
};

/**
 * Collects all properties from a schema, including properties defined in allOf members.
 * Returns merged properties object, combined required array, and property source paths.
 */
export const collectSchemaProperties = (
  schema: JsonSchemaObject,
  refs: Refs
): CollectedSchemaProperties | undefined => {
  let properties: Record<string, JsonSchema> = {};
  let required: string[] = [];
  const propertyPaths: Record<string, (string | number)[]> = {};

  // Collect direct properties
  if (schema.properties) {
    mergeProperties(properties, propertyPaths, schema.properties, refs.path);
  }

  // Collect direct required
  if (Array.isArray(schema.required)) {
    required = [...required, ...schema.required];
  }

  // Collect from allOf members
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((member, index) => {
      if (typeof member !== "object" || member === null) return;

      let resolvedMember = member as JsonSchemaObject;
      let memberPath: (string | number)[] = [...refs.path, "allOf", index];

      if (resolvedMember.$ref || resolvedMember.$dynamicRef) {
        const resolved = resolveRef(
          resolvedMember,
          (resolvedMember.$ref || resolvedMember.$dynamicRef)!,
          refs
        );
        if (resolved && typeof resolved.schema === "object" && resolved.schema !== null) {
          resolvedMember = resolved.schema as JsonSchemaObject;
          memberPath = resolved.path;
        } else {
          return;
        }
      }

      if (resolvedMember.properties) {
        mergeProperties(properties, propertyPaths, resolvedMember.properties, memberPath);
      }

      if (Array.isArray(resolvedMember.required)) {
        required = [...required, ...resolvedMember.required];
      }
    });
  }

  if (Object.keys(properties).length === 0) {
    return undefined;
  }

  return { properties, required: [...new Set(required)], propertyPaths };
};
