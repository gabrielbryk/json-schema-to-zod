import { JsonSchemaObject, JsonSchema, Refs, SchemaRepresentation } from "../Types.js";
import { parseSchema } from "./parseSchema.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { resolveRef } from "../utils/resolveRef.js";
import { collectSchemaProperties } from "../utils/collectSchemaProperties.js";
import { wrapRecursiveUnion } from "../utils/wrapRecursiveUnion.js";
import {
  zodAny,
  zodDiscriminatedUnion,
  zodSuperRefine,
  zodUnion,
  zodXor,
} from "../utils/schemaRepresentation.js";

/**
 * Check if a schema is a "required-only" validation constraint.
 * These are schemas that only specify `required` without defining types.
 */
const isRequiredOnlySchema = (
  schema: JsonSchema
): schema is JsonSchemaObject & { required: string[] } => {
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
 */
const generateRequiredFieldsRefinement = (
  requiredCombinations: string[][]
): SchemaRepresentation & { isRefinementOnly: true; refinementBody: string } => {
  const conditions = requiredCombinations.map((fields) => {
    const checks = fields.map((f) => `obj[${JSON.stringify(f)}] !== undefined`).join(" && ");
    return `(${checks})`;
  });

  const message = `Must have one of the following required field combinations: ${requiredCombinations.map((r) => r.join(", ")).join(" | ")}`;

  // The refinement function body (without the surrounding .superRefine())
  const refinementBody = `(obj, ctx) => { if (!(${conditions.join(" || ")})) { ctx.addIssue({ code: "custom", message: ${JSON.stringify(message)} }); } }`;

  // For standalone use, return z.any() with the refinement
  const base = zodAny();
  const refined = zodSuperRefine(base, refinementBody);

  return {
    ...refined,
    isRefinementOnly: true as const,
    refinementBody,
  };
};

/**
 * Result of discriminator detection.
 * - 'full': All options have constant discriminator values → use z.discriminatedUnion
 * - 'withDefault': Some options have const values, one has not:{enum:[...]} matching those values
 *                  → use z.union([z.discriminatedUnion(...), defaultCase])
 * - undefined: Cannot use discriminated union optimization
 */
type DiscriminatorResult =
  | { type: "full"; key: string }
  | { type: "withDefault"; key: string; defaultIndex: number; constValues: string[] }
  | undefined;

/**
 * Check if two sets contain the same elements.
 */
const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
};

/**
 * Extract discriminator values from a property schema.
 * Returns string values if it's a const or enum, undefined otherwise.
 */
const getDiscriminatorValues = (prop: JsonSchemaObject): string[] | undefined => {
  if (prop.const !== undefined && typeof prop.const === "string") {
    return [prop.const];
  }
  if (
    prop.enum &&
    Array.isArray(prop.enum) &&
    prop.enum.length > 0 &&
    prop.enum.every((value) => typeof value === "string")
  ) {
    return prop.enum as string[];
  }
  return undefined;
};

/**
 * Extract the negated enum values from a property schema.
 * Returns the enum values if the property has { not: { enum: [...] } }, undefined otherwise.
 */
const getNegatedEnumValues = (prop: JsonSchemaObject): string[] | undefined => {
  if (
    prop.not &&
    typeof prop.not === "object" &&
    prop.not !== null &&
    Array.isArray((prop.not as JsonSchemaObject).enum) &&
    (prop.not as JsonSchemaObject).enum!.every((v: unknown) => typeof v === "string")
  ) {
    return (prop.not as JsonSchemaObject).enum as string[];
  }
  return undefined;
};

/**
 * Attempts to find a discriminator property common to all options.
 */
const findImplicitDiscriminator = (options: JsonSchema[], refs: Refs): DiscriminatorResult => {
  if (options.length < 2) return undefined;

  // Fully resolve schemas and collect their properties (including from allOf)
  const resolvedOptions: { properties: Record<string, JsonSchema>; required: string[] }[] = [];

  for (const opt of options) {
    if (typeof opt !== "object" || opt === null) return undefined;

    let schemaObj = opt as JsonSchemaObject;

    // Resolve ref if needed
    if (schemaObj.$ref || schemaObj.$dynamicRef) {
      const resolved = resolveRef(schemaObj, (schemaObj.$ref || schemaObj.$dynamicRef)!, refs);
      if (resolved && typeof resolved.schema === "object" && resolved.schema !== null) {
        schemaObj = resolved.schema as JsonSchemaObject;
      } else {
        return undefined;
      }
    }

    // Must be an object type
    if (schemaObj.type !== "object") {
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
    const constValues: string[] = [];
    const constValuesSet = new Set<string>();
    let defaultIndex: number | undefined;
    let defaultEnumValues: string[] | undefined;
    let isValidDiscriminator = true;
    let optionsWithDiscriminator = 0;

    for (let i = 0; i < resolvedOptions.length; i++) {
      const opt = resolvedOptions[i];

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
      if (typeof prop === "object" && prop !== null && (prop.$ref || prop.$dynamicRef)) {
        const resolvedProp = resolveRef(
          prop as JsonSchemaObject,
          (prop.$ref || prop.$dynamicRef)!,
          refs
        );
        if (resolvedProp) {
          prop = resolvedProp.schema;
        }
      }

      if (typeof prop !== "object" || prop === null) {
        isValidDiscriminator = false;
        break;
      }

      // Check for constant value
      const constValue = getDiscriminatorValues(prop);
      if (constValue !== undefined) {
        optionsWithDiscriminator += 1;
        for (const value of constValue) {
          if (constValuesSet.has(value)) {
            isValidDiscriminator = false; // Duplicate value found
            break;
          }
          constValuesSet.add(value);
          constValues.push(value);
        }
        if (!isValidDiscriminator) {
          break;
        }
        continue;
      }

      // Check for negated enum (default case pattern)
      const negatedEnum = getNegatedEnumValues(prop);
      if (negatedEnum !== undefined) {
        if (defaultIndex !== undefined) {
          // Multiple defaults - can't optimize
          isValidDiscriminator = false;
          break;
        }
        defaultIndex = i;
        defaultEnumValues = negatedEnum;
        continue;
      }

      // Neither const nor not.enum - can't use discriminated union
      isValidDiscriminator = false;
      break;
    }

    if (!isValidDiscriminator) {
      continue;
    }

    // Check if all options have const values (full discriminated union)
    if (optionsWithDiscriminator === resolvedOptions.length) {
      return { type: "full", key };
    }

    // Check if we have a valid default case pattern
    if (
      defaultIndex !== undefined &&
      defaultEnumValues !== undefined &&
      optionsWithDiscriminator === resolvedOptions.length - 1
    ) {
      // Verify the negated enum exactly matches the const values
      const enumSet = new Set(defaultEnumValues);
      if (setsEqual(constValuesSet, enumSet)) {
        return { type: "withDefault", key, defaultIndex, constValues };
      }
    }
  }

  return undefined;
};

export const parseOneOf = (
  schema: JsonSchemaObject & { oneOf: JsonSchema[] },
  refs: Refs
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

  if (discriminator?.type === "full") {
    // All options have constant discriminator values
    const options = schema.oneOf.map((s, i) =>
      parseSchema(s, {
        ...refs,
        path: [...refs.path, "oneOf", i],
      })
    );

    const union = zodDiscriminatedUnion(discriminator.key, options, { readonlyType: true });
    return wrapRecursiveUnion(refs, union);
  }

  const parsedSchemas = schema.oneOf.map((s, i) => {
    const parsed = parseSchema(s, {
      ...refs,
      path: [...refs.path, "oneOf", i],
    });

    return parsed;
  });

  const override = getOneOfOverride(schema, refs);
  const strategy = refs.recursiveOneOfStrategy ?? "auto";
  const strategyToUse =
    override ??
    (strategy === "union" || strategy === "xor"
      ? strategy
      : shouldUseUnionForRecursiveOneOf(refs, parsedSchemas)
        ? "union"
        : "xor");

  if (strategyToUse === "union") {
    const union = zodUnion(parsedSchemas, { readonlyType: true });
    return wrapRecursiveUnion(refs, union);
  }

  // Fallback: Use z.xor for exclusive unions
  // z.xor takes exactly two arguments.
  // If more than 2, we must nest them: z.xor(A, z.xor(B, C)) ?
  // Or usage says: export function xor<const T extends readonly core.SomeType[]>(options: T, ...): ZodXor<T>
  // Wait, let's check `schemas.ts` again.
  // export function xor<const T extends readonly core.SomeType[]>(options: T, params?: ...): ZodXor<T>
  // It takes an array of options!
  // Wait, in `from-json-schema.ts` (Zod repo), how is it used?
  // It uses `z.xor`.
  // Let's verify `schemas.ts` content I viewed earlier.
  // Line 1368: export function xor<const T extends readonly core.SomeType[]>(options: T, params?: ...): ZodXor<T>
  // Yes, it takes an array `options`.
  // It says "Unlike regular unions that succeed when any option matches, xor fails if zero or more than one option matches the input."
  // Perfect.

  const xor = zodXor(parsedSchemas, { readonlyType: true });
  return wrapRecursiveUnion(refs, xor);
};

const getOneOfOverride = (
  schema: JsonSchemaObject & { oneOf: JsonSchema[] },
  refs: Refs
): "union" | "xor" | undefined => {
  const overrides = refs.oneOfOverrides;
  if (!overrides) {
    return undefined;
  }

  const current = refs.currentSchemaName;
  if (current && overrides[current]) {
    return overrides[current];
  }

  if (current) {
    const withoutSuffix = current.endsWith("Schema") ? current.slice(0, -"Schema".length) : current;
    if (withoutSuffix && overrides[withoutSuffix]) {
      return overrides[withoutSuffix];
    }
  }

  if (typeof schema.title === "string" && overrides[schema.title]) {
    return overrides[schema.title];
  }

  return undefined;
};

const shouldUseUnionForRecursiveOneOf = (
  refs: Refs,
  parsedSchemas: SchemaRepresentation[]
): boolean => {
  const current = refs.currentSchemaName;
  const isRecursive = current ? (refs.cycleRefNames?.has(current) ?? false) : false;
  const inCatchall = current ? (refs.catchallRefNames?.has(current) ?? false) : false;
  const hasLazyMembers = parsedSchemas.some((rep) => rep.node?.kind === "lazy");

  return Boolean(isRecursive && (inCatchall || hasLazyMembers));
};
