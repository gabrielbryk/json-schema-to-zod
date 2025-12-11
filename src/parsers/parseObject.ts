import { JsonSchema, JsonSchemaObject, Refs, SchemaRepresentation } from "../Types.js";
import { parseAnyOf } from "./parseAnyOf.js";
import { parseOneOf } from "./parseOneOf.js";
import { its, parseSchema } from "./parseSchema.js";
import { parseAllOf } from "./parseAllOf.js";
import { parseIfThenElse } from "./parseIfThenElse.js";
import { addJsdocs } from "../utils/jsdocs.js";
import { anyOrUnknown } from "../utils/anyOrUnknown.js";
import { containsRecursiveRef, inferTypeFromExpression } from "../utils/schemaRepresentation.js";

const collectKnownPropertyKeys = (schema: JsonSchemaObject): string[] => {
  const keys = new Set<string>();
  const visit = (node: JsonSchema | undefined) => {
    if (typeof node !== "object" || node === null) return;
    const obj = node as JsonSchemaObject;
    if (obj.properties && typeof obj.properties === "object") {
      Object.keys(obj.properties).forEach((key) => keys.add(key));
    }
  };

  visit(schema);
  if (Array.isArray(schema.oneOf)) schema.oneOf.forEach(visit);
  if (Array.isArray(schema.anyOf)) schema.anyOf.forEach(visit);
  if (Array.isArray(schema.allOf)) schema.allOf.forEach(visit);

  return Array.from(keys);
};

export function parseObject(
  objectSchema: JsonSchemaObject & { type: "object" },
  refs: Refs,
): SchemaRepresentation {
  // Optimization: if we have composition keywords (allOf/anyOf/oneOf) but no direct properties,
  // delegate entirely to the composition parser to avoid generating z.object({}).and(...)
  const hasDirectProperties = objectSchema.properties && Object.keys(objectSchema.properties).length > 0;
  const hasAdditionalProperties = objectSchema.additionalProperties !== undefined;
  const hasPatternProperties = objectSchema.patternProperties !== undefined;
  const hasNoDirectSchema = !hasDirectProperties && !hasAdditionalProperties && !hasPatternProperties;

  const parentRequired = Array.isArray(objectSchema.required) ? objectSchema.required : [];
  const allOfRequired = its.an.allOf(objectSchema)
    ? objectSchema.allOf.flatMap((member) => {
      if (typeof member !== "object" || member === null) return [];
      const req = (member as JsonSchemaObject).required;
      return Array.isArray(req) ? req : [];
    })
    : [];
  const combinedAllOfRequired = [...new Set([...parentRequired, ...allOfRequired])];

  // Helper to add type: "object" to composition members that have properties but no explicit type
  const addObjectType = (members: JsonSchema[]): JsonSchema[] =>
    members.map((x) =>
      typeof x === "object" &&
        x !== null &&
        !x.type &&
        (x.properties || x.additionalProperties || x.patternProperties)
        ? { ...x, type: "object" as const }
        : x,
    );

  const addObjectTypeAndMergeRequired = (members: JsonSchema[]): JsonSchema[] =>
    members.map((x) => {
      if (typeof x !== "object" || x === null) return x;

      let normalized: JsonSchemaObject = x as JsonSchemaObject;
      const hasShape = normalized.properties || normalized.additionalProperties || normalized.patternProperties;
      if (hasShape && !normalized.type) {
        normalized = { ...normalized, type: "object" as const };
      }

      if (
        combinedAllOfRequired.length &&
        normalized.properties &&
        Object.keys(normalized.properties).length
      ) {
        const memberRequired = Array.isArray(normalized.required) ? normalized.required : [];
        const mergedRequired = Array.from(
          new Set([
            ...memberRequired,
            ...combinedAllOfRequired.filter((key) =>
              Object.prototype.hasOwnProperty.call(normalized.properties!, key),
            ),
          ]),
        );

        if (mergedRequired.length) {
          normalized = { ...normalized, required: mergedRequired };
        }
      }

      return normalized;
    });

  // If only allOf, delegate to parseAllOf
  if (hasNoDirectSchema && its.an.allOf(objectSchema) && !its.an.anyOf(objectSchema) && !its.a.oneOf(objectSchema) && !its.a.conditional(objectSchema)) {
    return parseAllOf({ ...objectSchema, allOf: addObjectTypeAndMergeRequired(objectSchema.allOf!) }, refs);
  }

  // If only anyOf, delegate to parseAnyOf
  if (hasNoDirectSchema && its.an.anyOf(objectSchema) && !its.an.allOf(objectSchema) && !its.a.oneOf(objectSchema) && !its.a.conditional(objectSchema)) {
    return parseAnyOf({ ...objectSchema, anyOf: addObjectType(objectSchema.anyOf!) }, refs);
  }

  // If only oneOf, delegate to parseOneOf
  if (hasNoDirectSchema && its.a.oneOf(objectSchema) && !its.an.allOf(objectSchema) && !its.an.anyOf(objectSchema) && !its.a.conditional(objectSchema)) {
    return parseOneOf({ ...objectSchema, oneOf: addObjectType(objectSchema.oneOf!) }, refs);
  }

  let properties: string | undefined = undefined;
  // Track property types for building proper object type annotations
  const propertyTypes: Array<{ key: string; type: string }> = [];

  if (objectSchema.properties) {
    if (!Object.keys(objectSchema.properties).length) {
      properties = "z.object({})";
    } else {
      properties = "z.object({ ";

      properties += Object.keys(objectSchema.properties)
        .map((key) => {
          const propSchema = objectSchema.properties![key];

          const parsedProp = parseSchema(propSchema, {
            ...refs,
            path: [...refs.path, "properties", key],
          });

          const hasDefault =
            typeof propSchema === "object" && propSchema.default !== undefined;

          const required = Array.isArray(objectSchema.required)
            ? objectSchema.required.includes(key)
            : typeof propSchema === "object" && propSchema.required === true;

          const optional = !hasDefault && !required;

          const valueWithOptional = optional
            ? `${parsedProp.expression}.optional()`
            : parsedProp.expression;

          // Calculate the type for getters (needed for recursive type inference)
          const valueType = optional
            ? `z.ZodOptional<${parsedProp.type}>`
            : parsedProp.type;

          // Track the property type for building the object type
          propertyTypes.push({ key, type: valueType });

          const useGetter = shouldUseGetter(valueWithOptional, refs);
          let result = useGetter
            // Type annotation on getter is required for recursive type inference in unions
            ? `get ${JSON.stringify(key)}(): ${valueType} { return ${valueWithOptional} }`
            : `${JSON.stringify(key)}: ${valueWithOptional}`;

          if (refs.withJsdocs && typeof propSchema === "object") {
            result = addJsdocs(propSchema, result)
          }

          return result;
        })
        .join(", ");

      properties += " })";
    }
  }

  const additionalProperties =
    objectSchema.additionalProperties !== undefined
      ? parseSchema(objectSchema.additionalProperties, {
        ...refs,
        path: [...refs.path, "additionalProperties"],
      })
      : undefined;

  const unevaluated = objectSchema.unevaluatedProperties;
  const definedPropertyKeys = objectSchema.properties ? Object.keys(objectSchema.properties) : [];
  const missingRequiredKeys = Array.isArray(objectSchema.required)
    ? objectSchema.required.filter((key) => !definedPropertyKeys.includes(key))
    : [];

  let patternProperties: string | undefined = undefined;

  if (objectSchema.patternProperties) {
    const parsedPatternProperties = Object.fromEntries(
      Object.entries(objectSchema.patternProperties).map(([key, value]) => {
        return [
          key,
          parseSchema(value, {
            ...refs,
            path: [...refs.path, "patternProperties", key],
          }),
        ];
      }, {}),
    );

    // Helper to get expressions from parsed pattern properties
    const patternExprs = Object.values(parsedPatternProperties).map(r => r.expression);

    patternProperties = "";

    if (properties) {
      if (additionalProperties) {
        patternProperties += `.catchall(z.union([${[
          ...patternExprs,
          additionalProperties.expression,
        ].join(", ")}]))`;
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        patternProperties += `.catchall(z.union([${patternExprs.join(", ")}]))`;
      } else {
        patternProperties += `.catchall(${patternExprs.join("")})`;
      }
    } else {
      if (additionalProperties) {
        patternProperties += `z.record(z.string(), z.union([${[
          ...patternExprs,
          additionalProperties.expression,
        ].join(", ")}]))`;
      } else if (Object.keys(parsedPatternProperties).length > 1) {
        patternProperties += `z.record(z.string(), z.union([${patternExprs.join(", ")}]))`;
      } else {
        patternProperties += `z.record(z.string(), ${patternExprs.join("")})`;
      }
    }

    patternProperties += ".superRefine((value, ctx) => {\n";

    patternProperties += "for (const key in value) {\n";

    if (additionalProperties) {
      if (objectSchema.properties) {
        patternProperties += `let evaluated = [${Object.keys(
          objectSchema.properties,
        )
          .map((key) => JSON.stringify(key))
          .join(", ")}].includes(key)\n`;
      } else {
        patternProperties += `let evaluated = false\n`;
      }
    }

    for (const key in objectSchema.patternProperties) {
      patternProperties +=
        "if (key.match(new RegExp(" + JSON.stringify(key) + "))) {\n";
      if (additionalProperties) {
        patternProperties += "evaluated = true\n";
      }
      patternProperties +=
        "const result = " +
        parsedPatternProperties[key].expression +
        ".safeParse(value[key])\n";
      patternProperties += "if (!result.success) {\n";

      patternProperties += `ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: Key matching regex /\${key}/ must match schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;

      patternProperties += "}\n";
      patternProperties += "}\n";
    }

    if (additionalProperties) {
      patternProperties += "if (!evaluated) {\n";
      patternProperties +=
        "const result = " + additionalProperties.expression + ".safeParse(value[key])\n";
      patternProperties += "if (!result.success) {\n";

      patternProperties += `ctx.addIssue({
          path: [...(ctx.path ?? []), key],
          code: 'custom',
          message: \`Invalid input: must match catchall schema\`,
          params: {
            issues: result.error.issues
          }
        })\n`;

      patternProperties += "}\n";
      patternProperties += "}\n";
    }
    patternProperties += "}\n";
    patternProperties += "})";

    // Store original patternProperties in meta for JSON Schema round-trip
    if (refs.preserveJsonSchemaForRoundTrip) {
      const patternPropsJson = JSON.stringify(
        Object.fromEntries(
          Object.entries(objectSchema.patternProperties).map(([pattern, schema]) => [
            pattern,
            schema
          ])
        )
      );
      patternProperties += `.meta({ __jsonSchema: { patternProperties: ${patternPropsJson} } })`;
    }
  }

  // Check if there will be an .and() call that adds properties from oneOf/anyOf/allOf/if-then-else
  // In that case, we should NOT use .strict() because it will reject the additional keys
  // before the union gets a chance to validate them.
  const hasCompositionKeywords = its.an.anyOf(objectSchema) || its.a.oneOf(objectSchema) || its.an.allOf(objectSchema) || its.a.conditional(objectSchema);

  // When there are composition keywords (allOf, anyOf, oneOf, if-then-else) but no direct properties,
  // we should NOT default to z.record(z.string(), z.any()) because that would allow any properties.
  // Instead, use z.object({}) and let the .and() call add properties from the composition.
  // This is especially important when unevaluatedProperties: false is set.
  const shouldPassthroughForUnevaluated = unevaluated === false && hasCompositionKeywords;
  const passthroughProperties =
    shouldPassthroughForUnevaluated && properties && !patternProperties
      ? `${properties}.passthrough()`
      : properties;

  const fallback = anyOrUnknown(refs);
  let output: string = properties
    ? patternProperties
      ? properties + patternProperties
      : additionalProperties
        ? additionalProperties.expression === "z.never()"
          // Don't use .strict() if there are composition keywords that add properties
          ? hasCompositionKeywords
            ? passthroughProperties
            : properties + ".strict()"
          : properties + `.catchall(${additionalProperties.expression})`
        : passthroughProperties
    : patternProperties
      ? patternProperties
      : additionalProperties
        ? `z.record(z.string(), ${additionalProperties.expression})`
        // If we have composition keywords, start with empty object instead of z.record()
        // The composition will provide the actual schema via .and()
        : hasCompositionKeywords
          ? "z.object({})"
          // No constraints = any object. Use z.record() which is cleaner than z.object({}).catchall()
          : `z.record(z.string(), ${fallback.expression})`;

  if (unevaluated === false && properties && !hasCompositionKeywords) {
    output += ".strict()";
  } else if (unevaluated && typeof unevaluated !== 'boolean') {
    const unevaluatedSchema = parseSchema(unevaluated, {
      ...refs,
      path: [...refs.path, "unevaluatedProperties"],
    });

    const knownKeys = objectSchema.properties ? Object.keys(objectSchema.properties) : [];
    const patterns = objectSchema.patternProperties
      ? Object.keys(objectSchema.patternProperties).map((p) => new RegExp(p))
      : [];

    output += `.superRefine((value, ctx) => {
  for (const key in value) {
    const isKnown = ${JSON.stringify(knownKeys)}.includes(key);
    const matchesPattern = ${patterns.length ? "[" + patterns.map((r) => r.toString()).join(",") + "]" : "[]"}.some((r) => r.test(key));
    if (!isKnown && !matchesPattern) {
      const result = ${unevaluatedSchema.expression}.safeParse(value[key]);
      if (!result.success) {
        ctx.addIssue({ code: "custom", path: [key], message: "Invalid unevaluated property", params: { issues: result.error.issues } });
      }
    }
  }
})`;
  }

  // Track intersection types added via .and() calls
  const intersectionTypes: string[] = [];

  if (its.an.anyOf(objectSchema)) {
    const anyOfResult = parseAnyOf(
      {
        ...objectSchema,
        anyOf: objectSchema.anyOf.map((x) =>
          typeof x === "object" &&
            x !== null &&
            !x.type &&
            ((x as JsonSchemaObject).properties || (x as JsonSchemaObject).additionalProperties || (x as JsonSchemaObject).patternProperties)
            ? { ...(x as JsonSchemaObject), type: "object" }
            : x,
        ),
      },
      refs,
    );
    output += `.and(${anyOfResult.expression})`;
    intersectionTypes.push(anyOfResult.type);
  }

  if (its.a.oneOf(objectSchema)) {
    const oneOfResult = parseOneOf(
      {
        ...objectSchema,
        oneOf: objectSchema.oneOf.map((x) =>
          typeof x === "object" &&
            x !== null &&
            !x.type &&
            ((x as JsonSchemaObject).properties || (x as JsonSchemaObject).additionalProperties || (x as JsonSchemaObject).patternProperties)
            ? { ...(x as JsonSchemaObject), type: "object" }
            : x,
        ),
      },
      refs,
    );
    // Check if this is a refinement-only result (required fields validation)
    // If so, apply superRefine directly instead of creating an intersection
    const resultWithRefinement = oneOfResult as { isRefinementOnly?: boolean; refinementBody?: string };
    if (resultWithRefinement.isRefinementOnly && resultWithRefinement.refinementBody) {
      output += `.superRefine(${resultWithRefinement.refinementBody})`;
      // No intersection type needed - superRefine doesn't change the type
    } else {
      output += `.and(${oneOfResult.expression})`;
      intersectionTypes.push(oneOfResult.type);
    }
  }

  if (its.an.allOf(objectSchema)) {
    const allOfResult = parseAllOf(
      {
        ...objectSchema,
        allOf: addObjectTypeAndMergeRequired(objectSchema.allOf),
      },
      refs,
    );
    output += `.and(${allOfResult.expression})`;
    intersectionTypes.push(allOfResult.type);
  }

  // Handle if/then/else conditionals on object schemas
  if (its.a.conditional(objectSchema)) {
    const conditionalResult = parseIfThenElse(
      objectSchema as Parameters<typeof parseIfThenElse>[0],
      refs,
    );
    output += `.and(${conditionalResult.expression})`;
    intersectionTypes.push(conditionalResult.type);
  }

  if (unevaluated === false && hasCompositionKeywords) {
    const knownKeys = collectKnownPropertyKeys(objectSchema);
    const patternRegexps = objectSchema.patternProperties
      ? Object.keys(objectSchema.patternProperties).map((pattern) => new RegExp(pattern))
      : [];
    const patternRegexpsLiteral = patternRegexps.length
      ? `[${patternRegexps.map((r) => r.toString()).join(", ")}]`
      : "[new RegExp(\"$^\")]";

    output += `.superRefine((value, ctx) => {
  if (!value || typeof value !== "object") return;
  const knownKeys = ${JSON.stringify(knownKeys)};
  const patternRegexps = ${patternRegexpsLiteral};
  for (const key in value) {
    const isKnown = knownKeys.includes(key);
    const matchesPattern = patternRegexps.length ? patternRegexps.some((r) => r.test(key)) : false;
    if (!isKnown && !matchesPattern) {
      ctx.addIssue({ code: "unrecognized_keys", keys: [key], path: [key], message: "Unknown property" });
    }
  }
})`;
  }

  // Only add required validation for missing keys when there are no composition keywords
  // When allOf/anyOf/oneOf exist, they should define the properties and handle required validation
  if (missingRequiredKeys.length > 0 && !hasCompositionKeywords) {
    const checks = missingRequiredKeys
      .map(
        (key) =>
          `if (!Object.prototype.hasOwnProperty.call(value, ${JSON.stringify(key)})) { ctx.addIssue({ code: "custom", path: [${JSON.stringify(key)}], message: "Required property missing" }); }`,
      )
      .join(" ");

    output += `.superRefine((value, ctx) => { if (value && typeof value === "object") { ${checks} } })`;
  }

  // propertyNames
  if (objectSchema.propertyNames) {
    const normalizedPropNames =
      typeof objectSchema.propertyNames === "object" &&
        objectSchema.propertyNames !== null &&
        !objectSchema.propertyNames.type &&
        (objectSchema.propertyNames as JsonSchemaObject).pattern
        ? { ...(objectSchema.propertyNames as JsonSchemaObject), type: "string" }
        : objectSchema.propertyNames;

    const propNameSchema = parseSchema(normalizedPropNames, {
      ...refs,
      path: [...refs.path, "propertyNames"],
    });

    output += `.superRefine((value, ctx) => {
  for (const key in value) {
    const result = ${propNameSchema}.safeParse(key);
    if (!result.success) {
      ctx.addIssue({
        path: [key],
        code: "custom",
        message: "Invalid property name",
        params: { issues: result.error.issues }
      });
    }
  }
})`;
  }

  // dependentSchemas
  if (objectSchema.dependentSchemas && typeof objectSchema.dependentSchemas === "object") {
    const entries = Object.entries(objectSchema.dependentSchemas);
    if (entries.length) {
      output += `.superRefine((obj, ctx) => {
  ${entries
          .map(([key, schema]) => {
            const parsed = parseSchema(schema, { ...refs, path: [...refs.path, "dependentSchemas", key] });
            return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(key)})) {
    const result = ${parsed}.safeParse(obj);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: ${(objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage?.dependentSchemas ?? JSON.stringify("Dependent schema failed")}, path: [], params: { issues: result.error.issues } });
    }
  }`;
          })
          .join("\n  ")}
})`;
    }
  }

  // dependentRequired
  if (objectSchema.dependentRequired && typeof objectSchema.dependentRequired === "object") {
    const entries = Object.entries(objectSchema.dependentRequired);
    if (entries.length) {
      const depRequiredMessage =
        (objectSchema as { errorMessage?: Record<string, string | undefined> }).errorMessage?.dependentRequired ??
        "Dependent required properties missing";
      output += `.superRefine((obj, ctx) => {
  ${entries
          .map(([prop, deps]) => {
            const arr = Array.isArray(deps) ? deps : [];
            if (!arr.length) return "";
            const jsonDeps = JSON.stringify(arr);
            return `if (Object.prototype.hasOwnProperty.call(obj, ${JSON.stringify(prop)})) {
    const missing = ${jsonDeps}.filter((d) => !Object.prototype.hasOwnProperty.call(obj, d));
    if (missing.length) {
      ctx.addIssue({ code: "custom", message: ${JSON.stringify(
              depRequiredMessage,
            )}, path: [], params: { missing } });
    }
  }`;
          })
          .filter(Boolean)
          .join("\n  ")}
})`;
    }
  }

  // Build the type representation from tracked property types
  let type: string;
  if (propertyTypes.length > 0) {
    // Build proper object type with actual property types
    const typeShape = propertyTypes
      .map(({ key, type: propType }) => `${JSON.stringify(key)}: ${propType}`)
      .join("; ");
    type = `z.ZodObject<{ ${typeShape} }>`;
  } else if (properties === "z.object({})") {
    // Empty object
    type = "z.ZodObject<{}>";
  } else {
    // Fallback for complex cases (patternProperties, record, etc.)
    type = inferTypeFromExpression(output);
  }

  // Wrap in intersection types if .and() calls were added
  for (const intersectionType of intersectionTypes) {
    type = `z.ZodIntersection<${type}, ${intersectionType}>`;
  }

  return {
    expression: output,
    type,
  };
}

/**
 * Determines if a property should use getter syntax for recursive references.
 * Getters defer evaluation until access time, which is the Zod v4 recommended
 * approach for handling recursive schemas in object properties.
 */
const shouldUseGetter = (parsed: string, refs: Refs): boolean => {
  if (!parsed) return false;

  // Check for z.lazy() - these should use getters
  if (parsed.includes("z.lazy(")) return true;

  // Check for direct self-recursion (expression contains the current schema name)
  // This handles cases like generateSchemaBundle where the schema name is different
  // from the def name (e.g., NodeSchema vs node)
  if (refs.currentSchemaName) {
    const selfRefPattern = new RegExp(`\\b${refs.currentSchemaName}\\b`);
    if (selfRefPattern.test(parsed)) {
      return true;
    }
  }

  // Check for direct recursive references in the same SCC
  if (refs.currentSchemaName && refs.cycleRefNames && refs.cycleComponentByName) {
    const cycleRefNames = refs.cycleRefNames;
    const cycleComponentByName = refs.cycleComponentByName;
    const refNameArray = Array.from(cycleRefNames) as string[];

    // Check if expression contains a reference to a cycle member in the same component
    if (containsRecursiveRef(parsed, cycleRefNames)) {
      const currentComponent = cycleComponentByName.get(refs.currentSchemaName);
      if (currentComponent !== undefined) {
        for (let i = 0; i < refNameArray.length; i++) {
          const refName = refNameArray[i];
          const pattern = new RegExp(`\\b${refName}\\b`);
          if (pattern.test(parsed)) {
            const refComponent = cycleComponentByName.get(refName);
            if (refComponent === currentComponent) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
};
