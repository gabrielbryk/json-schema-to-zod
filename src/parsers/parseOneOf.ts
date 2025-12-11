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
 * Generate a z.any() schema with superRefine that validates required field combinations.
 * This handles the JSON Schema pattern where oneOf is used purely for validation.
 * Returns a complete schema expression that can be used in .and() context.
 */
const generateRequiredFieldsRefinement = (
  requiredCombinations: string[][],
): SchemaRepresentation => {
  const conditions = requiredCombinations.map((fields) => {
    const checks = fields.map((f) => `obj[${JSON.stringify(f)}] !== undefined`).join(" && ");
    return `(${checks})`;
  });

  const message = `Must have one of the following required field combinations: ${requiredCombinations.map((r) => r.join(", ")).join(" | ")}`;

  // Return z.any() with refinement so it can be used in .and() context
  const expression = `z.any().superRefine((obj, ctx) => { if (!(${conditions.join(" || ")})) { ctx.addIssue({ code: "custom", message: ${JSON.stringify(message)} }); } })`;

  return {
    expression,
    type: "z.ZodEffects<z.ZodAny>",
  };
};

/**
 * Attempts to find a discriminator property common to all options.
 * A discriminator must:
 * 1. Be present in 'properties' of all options (resolving $refs if needed)
 * 2. Be required in all options
 * 3. Have a constant string value (const or enum: [val]) in all options
 * 4. Have unique values across all options
 */
const findImplicitDiscriminator = (
  options: JsonSchema[],
  refs: Refs
): string | undefined => {
  if (options.length < 2) return undefined;

  // Fully resolve schemas to check their properties
  const resolvedOptions: (JsonSchemaObject | undefined)[] = options.map(opt => {
    if (typeof opt !== 'object' || opt === null) return undefined;

    // Resolve ref if needed
    if (opt.$ref || opt.$dynamicRef) {
      const resolved = resolveRef(opt as JsonSchemaObject, (opt.$ref || opt.$dynamicRef)!, refs);
      if (resolved && typeof resolved.schema === 'object' && resolved.schema !== null) {
        return resolved.schema as JsonSchemaObject;
      }
      return undefined;
    }
    return opt as JsonSchemaObject;
  });

  if (resolvedOptions.some(o => !o || o.type !== 'object' || !o.properties)) {
    return undefined; // Not all options are objects with properties
  }

  // Get all possible keys from the first option
  const firstProps = resolvedOptions[0]!.properties!;
  const candidateKeys = Object.keys(firstProps);

  for (const key of candidateKeys) {
    const values = new Set<string>();
    let isValidDiscriminator = true;

    for (const opt of resolvedOptions) {
      const schema = opt!;

      // Must be required
      if (!Array.isArray(schema.required) || !schema.required.includes(key)) {
        isValidDiscriminator = false;
        break;
      }

      const propBeforeResolve = schema.properties![key];
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
      // Use readonly tuple for union type annotations (required for recursive type inference)
      type: `z.ZodEffects<z.ZodUnion<readonly [${unionTypes}]>>`,
    };
  }

  return {
    expression: unionExpression,
    // Use readonly tuple for union type annotations (required for recursive type inference)
    type: `z.ZodUnion<readonly [${unionTypes}]>`,
  };
};
