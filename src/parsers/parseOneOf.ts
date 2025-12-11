import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { extractInlineObject } from "../utils/extractInlineObject.js";
import { resolveRef } from "../utils/resolveRef.js";

/**
 * Check if a schema is a "required-only" validation constraint.
 * These are schemas that only specify `required` without defining types.
 */
const isRequiredOnlySchema = (schema: JsonSchema): schema is JsonSchemaObject & { required: string[] } => {
  if (typeof schema !== "object" || schema === null) {
    return false;
  }
  const obj = schema as JsonSchemaObject;
  // Must have required array
  if (!Array.isArray(obj.required) || obj.required.length === 0) {
    return false;
  }
  // Must NOT have type-defining keywords
  if (obj.type || obj.properties || obj.additionalProperties || obj.patternProperties) {
    return false;
  }
  // Must NOT have composition keywords
  if (obj.allOf || obj.anyOf || obj.oneOf) {
    return false;
  }
  // Must NOT be a reference
  if (obj.$ref || obj.$dynamicRef) {
    return false;
  }
  return true;
};

/**
 * Generate a superRefine expression that validates required field combinations.
 * This handles the JSON Schema pattern where oneOf is used purely for validation.
 *
 * When isRefinementOnly is true, the expression is just the refinement function body
 * that should be appended with .superRefine() directly to the parent schema.
 */
const generateRequiredFieldsRefinement = (
  requiredCombinations: string[][],
): SchemaRepresentation & { isRefinementOnly: true; refinementBody: string } => {
  const conditions = requiredCombinations.map((fields) => {
    const checks = fields.map((f) => `obj[${JSON.stringify(f)}] !== undefined`).join(" && ");
    return `(${checks})`;
  });

  const message = `Must have one of the following required field combinations: ${requiredCombinations.map((r) => r.join(", ")).join(" | ")}`;

  // The refinement function body (without the surrounding .superRefine())
  const refinementBody = `(obj, ctx) => { if (!(${conditions.join(" || ")})) { ctx.addIssue({ code: "custom", message: ${JSON.stringify(message)} }); } }`;

  // For standalone use, return z.any() with the refinement
  const expression = `z.any().superRefine(${refinementBody})`;

  return {
    expression,
    type: "z.ZodAny",
    isRefinementOnly: true,
    refinementBody,
  };
};

/**
 * Collects all properties from a schema, including properties defined in allOf members.
 * Returns merged properties object and combined required array.
 */
const collectSchemaProperties = (
  schema: JsonSchemaObject,
  refs: Refs
): { properties: Record<string, JsonSchema>; required: string[] } | undefined => {
  let properties: Record<string, JsonSchema> = {};
  let required: string[] = [];

  // Collect direct properties
  if (schema.properties) {
    properties = { ...properties, ...schema.properties };
  }

  // Collect direct required
  if (Array.isArray(schema.required)) {
    required = [...required, ...schema.required];
  }

  // Collect from allOf members
  if (Array.isArray(schema.allOf)) {
    for (const member of schema.allOf) {
      if (typeof member !== 'object' || member === null) continue;

      let resolvedMember = member as JsonSchemaObject;

      // Resolve $ref if needed
      if (resolvedMember.$ref || resolvedMember.$dynamicRef) {
        const resolved = resolveRef(resolvedMember, (resolvedMember.$ref || resolvedMember.$dynamicRef)!, refs);
        if (resolved && typeof resolved.schema === 'object' && resolved.schema !== null) {
          resolvedMember = resolved.schema as JsonSchemaObject;
        } else {
          continue;
        }
      }

      // Merge properties from this allOf member
      if (resolvedMember.properties) {
        properties = { ...properties, ...resolvedMember.properties };
      }

      // Merge required from this allOf member
      if (Array.isArray(resolvedMember.required)) {
        required = [...required, ...resolvedMember.required];
      }
    }
  }

  // Return undefined if no properties found
  if (Object.keys(properties).length === 0) {
    return undefined;
  }

  return { properties, required: [...new Set(required)] };
};

/**
 * Attempts to find a discriminator property common to all options.
 * A discriminator must:
 * 1. Be present in 'properties' of all options (resolving $refs and allOf if needed)
 * 2. Be required in all options (checking both direct required and allOf required)
 * 3. Have a constant string value (const or enum: [val]) in all options
 * 4. Have unique values across all options
 */
const findImplicitDiscriminator = (
  options: JsonSchema[],
  refs: Refs
): string | undefined => {
  if (options.length < 2) return undefined;

  // Fully resolve schemas and collect their properties (including from allOf)
  const resolvedOptions: { properties: Record<string, JsonSchema>; required: string[] }[] = [];

  for (const opt of options) {
    if (typeof opt !== 'object' || opt === null) return undefined;

    let schemaObj = opt as JsonSchemaObject;

    // Resolve ref if needed
    if (schemaObj.$ref || schemaObj.$dynamicRef) {
      const resolved = resolveRef(schemaObj, (schemaObj.$ref || schemaObj.$dynamicRef)!, refs);
      if (resolved && typeof resolved.schema === 'object' && resolved.schema !== null) {
        schemaObj = resolved.schema as JsonSchemaObject;
      } else {
        return undefined;
      }
    }

    // Must be an object type
    if (schemaObj.type !== 'object') {
      return undefined;
    }

    // Collect all properties including from allOf
    const collected = collectSchemaProperties(schemaObj, refs);
    if (!collected) {
      return undefined;
    }

    resolvedOptions.push(collected);
  }

  // Get all possible keys from the first option
  const firstProps = resolvedOptions[0].properties;
  const candidateKeys = Object.keys(firstProps);

  for (const key of candidateKeys) {
    const values = new Set<string>();
    let isValidDiscriminator = true;

    for (const opt of resolvedOptions) {
      // Must be required
      if (!opt.required.includes(key)) {
        isValidDiscriminator = false;
        break;
      }

      const propBeforeResolve = opt.properties[key];
      if (!propBeforeResolve) {
        isValidDiscriminator = false;
        break;
      }

      // Resolve property schema ref if needed (e.g. definitions/kind -> const)
      let prop: JsonSchema = propBeforeResolve;
      if (typeof prop === 'object' && prop !== null && (prop.$ref || prop.$dynamicRef)) {
        const resolvedProp = resolveRef(prop as JsonSchemaObject, (prop.$ref || prop.$dynamicRef)!, refs);
        if (resolvedProp) {
          prop = resolvedProp.schema;
        }
      }

      if (typeof prop !== 'object' || prop === null) {
        isValidDiscriminator = false;
        break;
      }

      // Must be a constant (const or single-element enum) string
      let value: string | undefined;

      if (prop.const !== undefined && typeof prop.const === 'string') {
        value = prop.const;
      } else if (
        prop.enum &&
        Array.isArray(prop.enum) &&
        prop.enum.length === 1 &&
        typeof prop.enum[0] === 'string'
      ) {
        value = prop.enum[0];
      }

      if (value === undefined) {
        isValidDiscriminator = false;
        break;
      }

      if (values.has(value)) {
        isValidDiscriminator = false; // Duplicate value found
        break;
      }
      values.add(value);
    }

    if (isValidDiscriminator) {
      return key;
    }
  }

  return undefined;
}

export const parseOneOf = (
  schema: JsonSchemaObject & { oneOf: JsonSchema[] },
  refs: Refs,
): SchemaRepresentation => {
  if (!schema.oneOf.length) {
    return anyOrUnknown(refs);
  }

  if (schema.oneOf.length === 1) {
    return parseSchema(schema.oneOf[0], {
      ...refs,
      path: [...refs.path, "oneOf", 0],
    });
  }

  // Check if ALL oneOf members are "required-only" schemas
  const requiredOnlyMembers = schema.oneOf.filter(isRequiredOnlySchema);
  if (requiredOnlyMembers.length === schema.oneOf.length) {
    const requiredCombinations = requiredOnlyMembers.map((m) => m.required);
    return generateRequiredFieldsRefinement(requiredCombinations);
  }

  // Optimize: Check for implicit discriminated union
  const discriminator = findImplicitDiscriminator(schema.oneOf, refs);
  if (discriminator) {
    const options = schema.oneOf.map((s, i) =>
      parseSchema(s, {
        ...refs,
        path: [...refs.path, "oneOf", i],
      })
    );

    const expressions = options.map(o => o.expression).join(", ");
    const types = options.map(o => o.type).join(", ");

    return {
      expression: `z.discriminatedUnion("${discriminator}", [${expressions}])`,
      // Use readonly tuple for union type annotations (required for recursive type inference)
      type: `z.ZodDiscriminatedUnion<"${discriminator}", readonly [${types}]>`,
    };
  }

  // Fallback: Standard z.union
  const parsedSchemas: SchemaRepresentation[] = schema.oneOf.map((s, i) => {
    const extracted = extractInlineObject(s, refs, [...refs.path, "oneOf", i]);
    if (extracted) {
      // extractInlineObject returns a refName string
      return { expression: extracted, type: `typeof ${extracted}` };
    }

    let parsed = parseSchema(s, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    });

    // Make regular unions stricter: if it's an object, it shouldn't match emptiness.
    // Ensure we only apply .strict() to actual z.object() calls.
    if (
      typeof s === "object" &&
      s !== null &&
      (s.type === "object" || s.properties) &&
      !s.$ref &&
      parsed.expression.startsWith("z.object(") && // Critical check: Must be a Zod object
      !parsed.expression.includes(".and(") &&
      !parsed.expression.includes(".intersection(") &&
      !parsed.expression.includes(".strict()") &&
      !parsed.expression.includes(".catchall") &&
      !parsed.expression.includes(".passthrough")
    ) {
      parsed = {
        expression: parsed.expression + ".strict()",
        type: parsed.type, // .strict() doesn't change the Zod type
      };
    }

    return parsed;
  });

  // Build the union types for the SchemaRepresentation
  const unionTypes = parsedSchemas.map(r => r.type).join(", ");
  const unionExpression = `z.union([${parsedSchemas.map(r => r.expression).join(", ")}])`;

  if (refs.strictOneOf) {
    const schemasExpressions = parsedSchemas.map(r => r.expression).join(", ");
    const expression = `${unionExpression}.superRefine((x, ctx) => {
    const schemas = [${schemasExpressions}];
    const errors = schemas.reduce<z.ZodError[]>(
      (errors, schema) =>
        ((result) =>
          result.error ? [...errors, result.error] : errors)(
          schema.safeParse(x),
        ),
      [],
    );
    if (schemas.length - errors.length !== 1) {
      ctx.addIssue({
        path: [],
        code: "invalid_union",
        errors: errors.map(e => e.issues),
        message: "Invalid input: Should pass single schema",
      });
    }
  })`;

    return {
      expression,
      // In Zod v4, .superRefine() doesn't change the type
      type: `z.ZodUnion<readonly [${unionTypes}]>`,
    };
  }

  return {
    expression: unionExpression,
    // Use readonly tuple for union type annotations (required for recursive type inference)
    type: `z.ZodUnion<readonly [${unionTypes}]>`,
  };
};
